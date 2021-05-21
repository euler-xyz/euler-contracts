const et = require('./lib/eTestLib');

et.testSet({
    desc: "gas tests",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "simple gas",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.4)], },


        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },
        { from: ctx.wallet3, send: 'dTokens.dTST.repay', args: [0, et.eth(.1)], },
    ],
})




.run();
