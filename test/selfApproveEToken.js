const et = require('./lib/eTestLib');

et.testSet({
    desc: "self-approve eTokens",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, 1000], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})


.test({
    desc: "self-approve with valid amount",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },

        // revert on self-approve of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, 10], expectError: 'e/self-approval', },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },
    ],
})


.test({
    desc: "self-approve with zero amount",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },

        // revert on self-approve of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, 0], expectError: 'e/self-approval', },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },
    ],
})


.test({
    desc: "self-approve with max amount exceeding balance",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },

        // revert on self-approve of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, et.MaxUint256], expectError: 'e/self-approval', },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },
    ],
})


.test({
    desc: "self-approve for subAccount with valid amount",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, et.getSubAccount(ctx.wallet.address, 1)], assertEql: 0, },

        // revert on self-approve of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.approve', args: [et.getSubAccount(ctx.wallet.address, 1), 10], expectError: 'e/self-approval', },

        { call: 'eTokens.eTST.allowance', args: [ctx.wallet.address, ctx.wallet.address], assertEql: 0, },
    ],
})


.run();