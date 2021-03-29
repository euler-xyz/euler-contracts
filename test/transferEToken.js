const et = require('./lib/eTestLib');

et.testSet({
    desc: "transfer eToken balances, without interest",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, 1000], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})


.test({
    desc: "basic transfer",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, 400], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 600, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 400, },
    ],
})



.test({
    desc: "transfer max",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, et.MaxUint256], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
    ],
})



.test({
    desc: "approval, max",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 0, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], expectError: 'insufficient-allowance', },
        { from: ctx.wallet3, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], expectError: 'insufficient-allowance', },

        { from: ctx.wallet2, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, et.MaxUint256], },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: et.MaxUint256, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], },
        { from: ctx.wallet3, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 100], expectError: 'insufficient-allowance', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 700, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], assertEql: 300, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: et.MaxUint256, },
    ],
})



.test({
    desc: "approval, limited",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { from: ctx.wallet2, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, 200], },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 200, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 201], expectError: 'insufficient-allowance', },
        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 150], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 850, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], assertEql: 150, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 50, },
    ],
})



.test({
    desc: "transfer between sub-accounts",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 700], },
        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), et.getSubAccount(ctx.wallet.address, 255), 400], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 300, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 300, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 255)], assertEql: 400, },

        // Now send some to account 256, which is *not* a sub-account so can't transfer them back out:

        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 255), et.getSubAccount(ctx.wallet.address, 256), 100], },
        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 256), et.getSubAccount(ctx.wallet.address, 2), 50], expectError: 'e/insufficient-allowance', },

        // Finally, transfer some back to primary account:

        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), ctx.wallet.address, 30], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 330, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 270, },
    ],
})


.run();
