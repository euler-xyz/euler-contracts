const et = require('./lib/eTestLib');

const maxSaneAmount = ethers.BigNumber.from(2).pow(112).sub(1);


et.testSet({
    desc: "maximum amount values",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.MaxUint256], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
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

        // OK, by 1
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },

        // Now another deposit to push us over the top
        { send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },

        // And from another account, poolSize will be too large
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },

        // Withdraw exact balance
        { send: 'eTokens.eTST.withdraw', args: [0, maxSaneAmount], },
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
        { send: 'eTokens.eTST10.withdraw', args: [0, maxSaneAmount.div(ethers.BigNumber.from(10).pow(18))], },
    ],
})



.test({
    desc: "pullTokens results in euler balance being too large",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/amount-too-large', },
    ],
})


.test({
    desc: "increaseBalance results in totalBalances being too large",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
        { from: ctx.wallet2, send: 'exec.selfBorrow', args: [ctx.contracts.tokens.TST.address, 0, 10], expectError: 'e/amount-too-large-to-encode', },
    ],
})


/*
.test({
    desc: "FIXME: try to trigger failure to encode debt amount",

    actions: ctx => [
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '1', },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.1', },

        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { send: 'exec.selfBorrow', args: [ctx.contracts.tokens.TST3.address, 0, maxSaneAmount], },

        { from: ctx.wallet2, send: 'exec.selfBorrow', args: [ctx.contracts.tokens.TST3.address, 0, 10], },
    ],
})
*/



.test({
    desc: "high price saturation",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(32), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.a = r.collateralValue;
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(33), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.collateralValue.gt(ctx.stash.a));
            ctx.stash.b = r.collateralValue;
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(34), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.collateralValue.eq(ctx.stash.b));
        }, },
    ],
})


.test({
    desc: "low price saturation",

    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(3).add(10), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.a = r.collateralValue;
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(3), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.collateralValue.lt(ctx.stash.a));
            ctx.stash.b = r.collateralValue;
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: ethers.BigNumber.from(10).pow(3).sub(10), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.collateralValue.eq(ctx.stash.b));
        }, },
    ],
})


.run();
