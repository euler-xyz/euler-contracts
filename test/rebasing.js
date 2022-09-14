const et = require('./lib/eTestLib');

et.testSet({
    desc: "rebasing tokens",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(10)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})


.test({
    desc: "balances scale proportionally",
    actions: ctx => [
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), et.formatUnits(et.DefaultReserve)], },
        // Second user just loses 1 wei due to rounding
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: [et.eth(10), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet3.address], equals: et.eth(10), },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: et.eth(20), },

        // Now everybody's balance gets "rebased" up 1%

        { send: 'tokens.TST.setBalance', args: [ctx.wallet3.address, et.eth(10.1)], },
        { send: 'tokens.TST.setBalance', args: [ctx.contracts.euler.address, et.eth(20.2)], },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10.1), '0.10099999999999999'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: [et.eth(10.1), '0.10099999999999999'], },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet3.address], equals: et.eth(10.1), },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: [et.eth(10.1), '0.10099999999999999'], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: [et.eth(10.1), '0.10099999999999999'], },
    ],
})



.run();
