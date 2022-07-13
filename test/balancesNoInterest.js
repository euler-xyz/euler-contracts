const et = require('./lib/eTestLib');

et.testSet({
    desc: "deposit/withdraw balances, no interest",

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
    desc: "basic deposit/withdraw",
    actions: ctx => [
        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], }, // so pool size is big enough
        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },


        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: et.eth(10), },

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(et.AddressZero);
            et.expect(logs[0].args.to).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.value).to.equal(et.eth(10).add(et.DefaultReserve));
        }},


        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: et.eth(10).add(et.DefaultReserve), },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10).sub(1)], },

        // some unrelated token not affected
        { call: 'tokens.TST2.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: 0, },

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(10)], expectError: 'e/insufficient-balance', },

        { send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'ERC20: transfer amount exceeds balance', },

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(10).sub(1)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.to).to.equal(et.AddressZero);
            et.expect(logs[0].args.value).to.equal(et.eth(10).add(et.DefaultReserve));
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: et.eth(10).sub(1), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0, },

        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },
    ],
})


.test({
    desc: "multiple deposits",
    actions: ctx => [
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        // First user loses a small amount to the default reserves
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: et.eth(10), },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: '9.999999999999', },

        // Second user just loses 1 wei due to rounding
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(10).add(et.DefaultReserve), },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: '9.999999999999999999', },

        // Total supply is the two balances above, plus the default reserves
        { call: 'eTokens.eTST.totalSupply', equals: et.eth(10).add(et.eth(10).add(et.DefaultReserve)).add(et.DefaultReserve), },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, et.eth(10)], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.eth(10)], expectError: 'e/insufficient-balance', },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, et.eth('9.999999999999')], },

        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.eth('20')], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.eth(4)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.eth('6.00001')], expectError: 'e/insufficient-pool-size', },

        { from: ctx.wallet2, send: 'eTokens.eTST.withdraw', args: [0, et.eth('9.999999999999999999').sub(et.eth(4)).sub(1)], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },
        { call: 'eTokens.eTST.totalSupply', equals: et.BN(et.DefaultReserve), },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: et.eth('9.999999999999'), },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('9.999999999999999998'), },
    ],
})


.test({
    desc: "deposit/withdraw maximum",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: et.eth(10), },

        { send: 'eTokens.eTST.withdraw', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: et.eth('9.999999999999'), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0, },
    ],
})

.run();
