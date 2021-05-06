const et = require('./lib/eTestLib');

et.testSet({
    desc: "activating markets",
})


.test({
    desc: "re-activate",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            ctx.stash.eTokenAddr = r;
        }},

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(ctx.stash.eTokenAddr).to.equal(r);
        }},
    ],
})


.test({
    desc: "invalid contracts",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.euler.address], expectError: 'e/markets/invalid-token', },

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.eTokens.eTST.address], expectError: 'e/markets/invalid-token', },
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.dTokens.dTST.address], expectError: 'e/markets/invalid-token', },
    ],
})

.run();
