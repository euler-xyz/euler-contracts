const et = require('./lib/eTestLib');

// TST9 has 6 decimals

et.testSet({
    desc: "tokens with non-18 decimals",

    preActions: ctx => {
        let actions = [];

        actions.push({ action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', });

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST9.mint', args: [from.address, et.units('100', 6)], });
            actions.push({ from, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);
            actions.push({ from, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        }

        actions.push({ action: 'updateUniswapPrice', pair: 'TST9/WETH', price: '.5', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.2', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "basic flow",
    actions: ctx => [
        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(1, 6), },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(1, 6), },

        { send: 'eTokens.eTST9.withdraw', args: [0, et.units(.2, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(.8, 6), },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(.8), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99.2, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.8, 6), },

        { from: ctx.wallet3, send: 'dTokens.dTST9.borrow', args: [0, et.units(.3, 6)], },
        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0.300001', 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units(.3, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.5, 6), },

        // FIXME: repay, transfers, interest, dust after repays
    ],
})


.run();
