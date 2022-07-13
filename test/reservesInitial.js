const et = require('./lib/eTestLib');

et.testSet({
    desc: "reserves initial value",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.units(100)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });

            actions.push({ from, send: 'tokens.TST9.mint', args: [from.address, et.units(100, 6)], });
            actions.push({ from, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });

            actions.push({ from, send: 'tokens.TST10.mint', args: [from.address, et.units(100, 0)], });
            actions.push({ from, send: 'tokens.TST10.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})



.test({
    desc: "exchange rate manipulation, 18 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], },
        { call: 'eTokens.eTST.totalSupply', equals: et.BN(et.DefaultReserve) },

        // Deposit exactly 1 wei
        { send: 'eTokens.eTST.deposit', args: [0, 1], },

        { send: 'tokens.TST.transfer', args: [ctx.contracts.euler.address, et.units(50)], },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.units(10)], },

        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        // Without initial reserves, user is able to steal the 10 unit deposit:
        // { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: [110, .0001], },
        // { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: [90, .0001], },

        // With initial reserves, the 50 units were mostly donated to the reserves:
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: [50, .0001], },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: [100, .0001], },
        { call: 'eTokens.eTST.reserveBalanceUnderlying', equals: [50, .0001], },
    ],
})



.test({
    desc: "exchange rate manipulation, non-18 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST9.address], },
        { call: 'eTokens.eTST9.totalSupply', equals: et.BN(et.DefaultReserve)},
        { call: 'eTokens.eTST9.totalSupplyUnderlying', equals: 0}, // initial reserve is not scaled up

        // Deposit exactly 1 wei (base unit)
        { send: 'eTokens.eTST9.deposit', args: [0, 1], },

        { send: 'tokens.TST9.transfer', args: [ctx.contracts.euler.address, et.units(50, 6)], },

        { from: ctx.wallet2, send: 'eTokens.eTST9.deposit', args: [0, et.units(10, 6)], },


        { send: 'eTokens.eTST9.withdraw', args: [0, et.MaxUint256], },
        { from: ctx.wallet2, send: 'eTokens.eTST9.withdraw', args: [0, et.MaxUint256], },


        // With non-18 decimal tokens, the initial reserves are much lower value, and 1 wei deposit 
        // is scaled up. The effect is negligible
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], equals: et.units(99.99995, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet2.address], equals: et.units(100, 6), },
        { call: 'eTokens.eTST9.reserveBalanceUnderlying', equals: et.units(0.00005, 6), },
    ],
})



.test({
    desc: "exchange rate manipulation, 0 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST10.address], },
        { call: 'eTokens.eTST10.totalSupply', equals: et.BN(et.DefaultReserve)},
        { call: 'eTokens.eTST10.totalSupplyUnderlying', equals: 0}, // initial reserve is not scaled up

        // Deposit exactly 1 wei
        { send: 'eTokens.eTST10.deposit', args: [0, 1], },

        { send: 'tokens.TST10.transfer', args: [ctx.contracts.euler.address, 50], },

        { from: ctx.wallet2, send: 'eTokens.eTST10.deposit', args: [0, 10], },


        { send: 'eTokens.eTST10.withdraw', args: [0, et.MaxUint256], },
        { from: ctx.wallet2, send: 'eTokens.eTST10.withdraw', args: [0, et.MaxUint256], },

        // With 0 decimal tokens, effect is small
        { call: 'tokens.TST10.balanceOf', args: [ctx.wallet.address], equals: et.BN(99), },
        { call: 'tokens.TST10.balanceOf', args: [ctx.wallet2.address], equals: et.BN(100), },
        { call: 'eTokens.eTST10.reserveBalanceUnderlying', equals: et.BN(1), },
    ],
})




.test({
    desc: "first depositor donation, 18 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], },

        { send: 'eTokens.eTST.deposit', args: [0, et.units(1, 18)], },
        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        // a very small amount is donated to the reserves
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: [et.units(100, 18), '0.000000000001'], },
        { call: 'eTokens.eTST.reserveBalanceUnderlying', equals: et.BN(et.DefaultReserve) },
    ],
})



.test({
    desc: "first depositor donation, non-18 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST9.address], },

        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1, 6)], },
        { send: 'eTokens.eTST9.withdraw', args: [0, et.MaxUint256], },

        // a very small amount is donated to the reserves - one base unit
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], equals: [et.units(100, 6), '0.000001'], },
        { call: 'eTokens.eTST9.reserveBalanceUnderlying', equals: et.BN(1) },
    ],
})



.test({
    desc: "first depositor donation, 0 decimal place token",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST10.address], },

        { send: 'eTokens.eTST10.deposit', args: [0, 2], },
        { send: 'eTokens.eTST10.withdraw', args: [0, et.MaxUint256], },

        // one token is donated to the reserves
        { call: 'tokens.TST10.balanceOf', args: [ctx.wallet.address], equals: et.BN(100 - 1), },
        { call: 'eTokens.eTST10.reserveBalanceUnderlying', equals: et.BN(1) },
    ],
})



.run();
