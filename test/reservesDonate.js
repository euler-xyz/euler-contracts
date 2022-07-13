const et = require('./lib/eTestLib');

et.testSet({
    desc: "donate to reserves",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.units(100)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });

            actions.push({ from, send: 'tokens.TST9.mint', args: [from.address, et.units(100, 6)], });
            actions.push({ from, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        actions.push({ send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], });
        actions.push({ send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST9.address], });

        return actions;
    },
})



.test({
    desc: "donate to reserves - basic",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)] },
        { call: 'eTokens.eTST.totalSupply', equals: [et.eth(10), '0.000000001' ], onResult: r => {
            ctx.stash.ts = r;
        } },

        { send: 'eTokens.eTST.donateToReserves', args: [0, et.eth(1)], onLogs: logs => {
            et.expect(logs.length).to.equal(4);

            et.expect(logs[0].name).to.equal('RequestDonate');
            et.expect(logs[0].args.account).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));

            et.expect(logs[1].name).to.equal('Withdraw');
            et.expect(logs[1].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[1].args.account).to.equal(ctx.wallet.address);
            et.expect(logs[1].args.amount).to.equal(et.eth(1));

            et.expect(logs[2].name).to.equal('Transfer');
            et.expect(logs[2].args.from).to.equal(ctx.wallet.address);
            et.expect(logs[2].args.to).to.equal(et.AddressZero);
            et.expect(logs[2].args.value).to.equal(et.eth(1));
        } },

        { call: 'eTokens.eTST.totalSupply', equals: () => ctx.stash.ts },
        { call: 'eTokens.eTST.reserveBalance', equals: et.eth(1).add(et.DefaultReserve) },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: [et.eth(9), '0.000000001'] },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: et.eth(10), },
    ],
})



.test({
    desc: "donate to reserves - non-18 decimal places token",
    actions: ctx => [
        { send: 'eTokens.eTST9.deposit', args: [0, et.units(10, 6)] },
        { call: 'eTokens.eTST9.totalSupply', equals: [et.eth(10), '0.000000001'], onResult: r => {
            ctx.stash.ts = r;
        } },

        { send: 'eTokens.eTST9.donateToReserves', args: [0, et.eth(1)], onLogs: logs => {
            et.expect(logs.length).to.equal(4);

            et.expect(logs[0].name).to.equal('RequestDonate');
            et.expect(logs[0].args.account).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));

            et.expect(logs[1].name).to.equal('Withdraw');
            et.expect(logs[1].args.underlying).to.equal(ctx.contracts.tokens.TST9.address);
            et.expect(logs[1].args.account).to.equal(ctx.wallet.address);
            et.expect(logs[1].args.amount).to.equal(et.eth(1));

            et.expect(logs[2].name).to.equal('Transfer');
            et.expect(logs[2].args.from).to.equal(ctx.wallet.address);
            et.expect(logs[2].args.to).to.equal(et.AddressZero);
            et.expect(logs[2].args.value).to.equal(et.eth(1));
        } },

        { call: 'eTokens.eTST9.totalSupply', equals: () => ctx.stash.ts },
        { call: 'eTokens.eTST9.totalSupplyUnderlying', equals: [et.units(10, 6), '0.000000001'] },
        { call: 'eTokens.eTST9.reserveBalance', equals: et.eth(1).add(et.DefaultReserve) },
        { call: 'eTokens.eTST9.reserveBalanceUnderlying', equals: [et.units(1, 6), '0.000000001'] },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], equals: [et.eth(9), '0.000000001'] },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(9, 6), '0.000000001'] },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], equals: et.units(10, 6), },
    ],
})



.test({
    desc: "donate to reserves - max uint",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)] },

        { send: 'eTokens.eTST.donateToReserves', args: [0, et.MaxUint256] },

        { call: 'eTokens.eTST.totalSupply', equals: [et.eth(10), '0.000000001'] },
        { call: 'eTokens.eTST.reserveBalance', equals: et.eth(10).add(et.DefaultReserve) },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0 },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: et.eth(10), },
    ],
})



.test({
    desc: "donate to reserves - insufficient balance",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)]},

        { send: 'eTokens.eTST.donateToReserves', args: [0, et.eth(11)], expectError: 'e/insufficient-balance' },
    ],
})



.run();
