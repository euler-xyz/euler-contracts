const et = require('./lib/eTestLib');

et.testSet({
    desc: "deposit/withdraw balances, no interest",

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
    desc: "basic deposit/withdraw",
    actions: ctx => [
        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], }, // so pool size is big enough
        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },


        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { send: 'eTokens.eTST.deposit', args: [0, 1000], },


        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        // some unrelated token not affected
        { call: 'tokens.TST2.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        { send: 'eTokens.eTST.withdraw', args: [0, 1001], expectError: 'e/insufficient-balance', },

        { send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'ERC20: transfer amount exceeds balance', },

        { send: 'eTokens.eTST.withdraw', args: [0, 1000], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },
    ],
})


.test({
    desc: "multiple deposits",
    actions: ctx => [
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, 1000], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
        { call: 'eTokens.eTST.totalSupply', assertEql: 2000, },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, 1001], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, 1001], expectError: 'e/insufficient-balance', },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, 1000], },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, 1001], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, 400], },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, 601], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, 600], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },
        { call: 'eTokens.eTST.totalSupply', assertEql: 0, },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
    ],
})


.test({
    desc: "deposit/withdraw maximum",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
    ],
})

.run();
