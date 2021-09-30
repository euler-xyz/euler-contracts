const et = require('./lib/eTestLib');

et.testSet({
    desc: "self-approve dTokens",

    preActions: ctx => {
        let actions = [
            { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
        ];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2]) {
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
    desc: "self-approve with valid amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },

        // revert on self-approve of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet2.address, et.eth(.1)], expectError: 'e/self-approval', },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },
    ],
})

.test({
    desc: "self-approve with zero amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },

        // revert on self-approve of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet2.address, 0], expectError: 'e/self-approval', },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },
    ],
})


.test({
    desc: "self-approve with max amount exceeding balance",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },

        // revert on self-approve of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet2.address, et.MaxUint256], expectError: 'e/self-approval', },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },
    ],
})


.test({
    desc: "self-approve for subAccount with valid amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, et.getSubAccount(ctx.wallet2.address, 1)], assertEql: 0, },

        // revert on self-approve of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.approveDebt', args: [0, et.getSubAccount(ctx.wallet2.address, 1), et.eth(.1)], expectError: 'e/self-approval', },

        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet2.address, ctx.wallet2.address], assertEql: 0, },
    ],
})


.run();
