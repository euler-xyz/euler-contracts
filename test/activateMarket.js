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


.test({
    desc: "no uniswap pool",
    actions: ctx => [
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/no-uniswap-pool-avail', },
    ],
})


.test({
    desc: "uniswap pool not initiated",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowNotInitiated(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/risk/uniswap-pool-not-inited', },
    ],
})


.test({
    desc: "uniswap pool other error",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowOther(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/risk/uniswap/OTHER', },
    ],
})


.test({
    desc: "uniswap pool empty error",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowEmpty(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/empty-error', },
    ],
})


.test({
    desc: "select second fee uniswap pool",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
    ],
})


.test({
    desc: "select third fee uniswap pool",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
    ],
})



.test({
    desc: "choose pool with best liquidity",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [9000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 2",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 3",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.MEDIUM);
        }, },
    ],
})


.test({
    desc: "pool address computation",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },

        // Make it so that getPool(LOW) returns the pool for MEDIUM, to cause the CREATE2 address computation to fail

        { action: 'cb', cb: async () => {
            let lowPool = await ctx.contracts.uniswapV3Factory.getPool(ctx.contracts.tokens.TST4.address, ctx.contracts.tokens.WETH.address, et.FeeAmount.LOW);

            await ctx.contracts.uniswapV3Factory.setPoolAddress(ctx.contracts.tokens.TST4.address, ctx.contracts.tokens.WETH.address, et.FeeAmount.MEDIUM, lowPool);
        }, },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/bad-uniswap-pool-addr'},
    ],
})


.run();
