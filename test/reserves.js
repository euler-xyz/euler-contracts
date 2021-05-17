const et = require('./lib/eTestLib');

et.testSet({
    desc: "reserves",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet3, ctx.wallet4]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);
            actions.push({ from, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        }

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.1', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.2', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "reserves",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '60', },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: 0, },

        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], equals: ['5.041955', '0.000001'], },

        // 0.041955 * 0.075 = 0.003146625
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.003146', '0.000001'], },

        // After fees: 0.041955 - 0.003146 = 0.038809
        // wallet should get 5/6 of this: 0.03234 (plus original 50)
        // wallet2 should get 1/6 of this: 0.00646 (plus original 10)

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['50.03234', '0.00001'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: ['10.00646', '0.00001'], },

        // Some more interest earned:

        { action: 'jumpTimeAndMine', time: 90*86400, },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], equals: ['5.167823', '0.000001'], },

        // 0.167823 * 0.075 = 0.012586
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.012586', '0.000001'], },
    ],
})


.run();
