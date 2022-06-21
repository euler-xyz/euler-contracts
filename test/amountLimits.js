const et = require('./lib/eTestLib');

const maxSaneAmount = ethers.BigNumber.from(2).pow(112).sub(1);


et.testSet({
    desc: "maximum amount values",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.MaxUint256], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });

            actions.push({ from, send: 'tokens.TST6.mint', args: [from.address, et.MaxUint256], });
            actions.push({ from, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})


.test({
    desc: "deposits and withdrawals",
    actions: ctx => [
        // Reads balanceOf on TST, which returns amount too large
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], expectError: 'e/amount-too-large', },

        // Specifies direct amount too large
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256.sub(1)], expectError: 'e/amount-too-large', },
        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256.sub(1)], expectError: 'e/amount-too-large', },

        // One too large
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount.add(1)], expectError: 'e/amount-too-large', },
        { send: 'eTokens.eTST.withdraw', args: [0, maxSaneAmount.add(1)], expectError: 'e/amount-too-large', },

        // Now too large to encode due to initial reserve balance 
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount],expectError: 'e/amount-too-large-to-encode', },

        // Ok after reducing by default initial reserve balance
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount.sub(et.BN(et.DefaultReserve))], },

        // Now another deposit to push us over the top
        { send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },

        // And from another account, poolSize will be too large
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },

        // Cannot withdraw balance as it will be the full poolSize including default reserve balance
        { send: 'eTokens.eTST.withdraw', args: [0, maxSaneAmount], expectError: 'e/insufficient-pool-size', },

        // Withdraw exact balance
        // however, balance is not exactly max sane amount due to loss of 1 wei to pool
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: [et.formatUnits(maxSaneAmount), '0.000000000001'], },

        // balance in underlying will have a small variation after conversion and rounding
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.formatUnits(maxSaneAmount.sub(et.BN(et.DefaultReserve))), '0.01'], },
        { call: 'eTokens.eTST.totalSupply', equals: et.formatUnits(maxSaneAmount), },

        // withdraw max for full balance
        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        // check balances
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: 0, },
    ],
})


.test({
    desc: "lower decimals",
    actions: ctx => [
        { send: 'tokens.TST10.mint', args: [ctx.wallet.address, et.MaxUint256], },
        { send: 'tokens.TST10.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },

        // Reads balanceOf on TST, which returns amount too large
        { send: 'eTokens.eTST10.deposit', args: [0, et.MaxUint256], expectError: 'e/amount-too-large', },

        // Specifies direct amount too large
        { send: 'eTokens.eTST10.deposit', args: [0, et.MaxUint256.sub(1)], expectError: 'e/amount-too-large', },
        { send: 'eTokens.eTST10.withdraw', args: [0, et.MaxUint256.sub(1)], expectError: 'e/amount-too-large', },

        // One too large
        { send: 'eTokens.eTST10.deposit', args: [0, maxSaneAmount.div(ethers.BigNumber.from(10).pow(18)).add(1)],
          expectError: 'e/amount-too-large', },
        { send: 'eTokens.eTST10.withdraw', args: [0, maxSaneAmount.div(ethers.BigNumber.from(10).pow(18)).add(1)],
          expectError: 'e/amount-too-large', },

        // OK, by 1
        { send: 'eTokens.eTST10.deposit', args: [0, maxSaneAmount.div(ethers.BigNumber.from(10).pow(18))], },

        // cannot withdraw exact amount deposited due to initial reserve balance
        { send: 'eTokens.eTST10.withdraw', args: [0, maxSaneAmount.div(ethers.BigNumber.from(10).pow(18))], expectError: 'e/insufficient-balance', },
        { call: 'eTokens.eTST10.balanceOf', args: [ctx.wallet.address], equals: maxSaneAmount.div(ethers.BigNumber.from(10).pow(18)).mul(ethers.BigNumber.from(10).pow(18)), },
        { call: 'eTokens.eTST10.balanceOfUnderlying', args: [ctx.wallet.address], equals: [maxSaneAmount.div(ethers.BigNumber.from(10).pow(18)), '0.000000000000000001'], },

        { send: 'eTokens.eTST10.withdraw', args: [0, et.MaxUint256], },
        { call: 'eTokens.eTST10.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST10.balanceOfUnderlying', args: [ctx.wallet.address], equals: 0, },
    ],
})



.test({
    desc: "pullTokens results in euler balance being too large",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], expectError: 'e/amount-too-large-to-encode', },

        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount.sub(et.BN(et.DefaultReserve))], },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },
    ],
})


.test({
    desc: "increaseBalance results in totalBalances being too large",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], expectError: 'e/amount-too-large-to-encode', },

        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount.sub(et.BN(et.DefaultReserve))], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, 10], expectError: 'e/amount-too-large-to-encode', },
    ],
})



.run();
