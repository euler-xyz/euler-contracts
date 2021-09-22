const et = require('./lib/eTestLib');

et.testSet({
    desc: "uniswap3 twap",
    fixture: "real-uniswap",
})


.test({
    desc: "integration with uniswap3 core",
    actions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256,], },

        { send: 'tokens.WETH.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.WETH.approve', args: [ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256,], },

        // Uniswap pool has been created, but not init'ed

        { action: 'getPrice', underlying: 'TST', expectError: 'e/market-not-activated', },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], expectError: 'e/risk/uniswap-pool-not-inited', },

        // Init uniswap pool, euler pool still not activated

        { send: 'uniswapPools.TST/WETH.initialize', args: [et.ratioToSqrtPriceX96(et.c1e18, et.c1e18)], },
        { action: 'checkpointTime', },
        { action: 'getPrice', underlying: 'TST', expectError: 'e/market-not-activated', },

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(0);
            et.expect(r.observationCardinality).to.equal(1);
            et.expect(r.observationCardinalityNext).to.equal(1);
        }},

        // Activate euler market

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], },

        // No initialized ticks, so unable to get a price

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.equals(r.currPrice, 1);
            et.expect(r.twapPeriod).to.equal(await ctx.lastBlockTimestamp() - ctx.lastCheckpointTime);
            et.equals(r.twap, 1);
        }},

        // Just testing that the minimal getPrice() also works
        { action: 'getPriceMinimal', underlying: 'TST', onResult: async (r) => {
            et.expect(r.currPrice).to.equal(undefined);
            et.expect(r.twapPeriod).to.equal(await ctx.lastBlockTimestamp() - ctx.lastCheckpointTime);
            et.equals(r.twap, 1);
        }},

        // observationCardinalityNext was set to 10 by activate

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(0);
            et.expect(r.observationCardinality).to.equal(1);
            et.expect(r.observationCardinalityNext).to.equal(10);
        }},

        // Supply some liquidity (assuming tickSpacing of 60): Math.ceil(-887272 / 60) * 60 = -887220, Math.floor(887272 / 60) * 60 = 887220

        { send: 'simpleUniswapPeriphery.mint', args: [() => ctx.contracts.uniswapPools["TST/WETH"].address, ctx.wallet.address, -887220, 887220, et.eth('1.0')], },

        // The mint increases the observationIndex, and is able to bump up the cardinality since the
        // index was at the last element.

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(1);
            et.expect(r.observationCardinality).to.equal(10);
            et.expect(r.observationCardinalityNext).to.equal(10);
        }},

        // getPrice still succeeds, twap is longer

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.equals(r.currPrice, 1);
            et.expect(r.twapPeriod).to.equal(await ctx.lastBlockTimestamp() - ctx.lastCheckpointTime);
            et.equals(r.twap, 1);
        }},

        // Call getPrice in non-static mode to apply "negative feedback". Since TWAP is less than desired, increase ring buffer size.

        { action: 'getPriceNonStatic', underlying: 'TST', }, // increase cardinalityNext by 1
        { action: 'getPriceNonStatic', underlying: 'TST', }, // no-op, already increased

        // cardinalityNext is now increased by 1

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(1);
            et.expect(r.observationCardinality).to.equal(10);
            et.expect(r.observationCardinalityNext).to.equal(11);
        }},

        // Now do a swap. First define a utility to do this:

        { action: 'cb', cb: async () => {
            ctx.stash.doSwap = async () => {
                if (ethers.BigNumber.from(ctx.contracts.tokens.WETH.address).lt(ctx.contracts.tokens.TST.address)) {
                    let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact0For1(ctx.contracts.uniswapPools["TST/WETH"].address, et.eth(0.001), ctx.wallet.address, et.ratioToSqrtPriceX96(1, 1000));
                    await tx.wait();
                } else {
                    let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact1For0(ctx.contracts.uniswapPools["TST/WETH"].address, et.eth(0.001), ctx.wallet.address, et.ratioToSqrtPriceX96(1000, 1));
                    await tx.wait();
                }
            };
        }},

        // And do it:

        { action: 'cb', cb: async () => { await ctx.stash.doSwap(); }},

        // Index now increases to 2:

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(2);
            et.expect(r.observationCardinality).to.equal(10);
            et.expect(r.observationCardinalityNext).to.equal(11);
        }},

        // currPrice is updated, but TWAP not yet

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.equals(r.currPrice, 0.9980, .0001);
            let now = await ctx.lastBlockTimestamp();
            et.expect(r.twapPeriod).to.equal(now - ctx.lastCheckpointTime);
            et.equals(r.twap, 1); // un-affected since trade happened in most recent block

            ctx.stash.timeA = ctx.lastCheckpointTime;
            ctx.stash.timeB = now;
        }},
        { action: 'checkpointTime', },

        // Jump forward 5 seconds

        { action: 'jumpTimeAndMine', time: 5, },

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.equals(r.currPrice, 0.9980, .0001);
            let currPrice = parseFloat(et.ethers.utils.formatEther(r.currPrice));

            let now = await ctx.lastBlockTimestamp();
            et.expect(r.twapPeriod).to.equal(now - ctx.stash.timeA);

            // Confirm that twap is the average (approximate it with arithmetic mean)

            let expectedTwap = ((1 * (ctx.stash.timeB - ctx.stash.timeA)) + (currPrice * (now - ctx.stash.timeB))) / r.twapPeriod.toNumber();
            et.equals(r.twap, expectedTwap, 0.0001);
        }},

        // A bunch more swaps

        { action: 'cb', cb: async () => {
            for (let i = 0; i < 8; i++) {
                await ctx.stash.doSwap();
            }
        }},

        // Now we've init'ed all 11 observations

        { call: 'uniswapPools.TST/WETH.slot0', args: [], onResult: async (r) => {
            et.expect(r.observationIndex).to.equal(10);
            et.expect(r.observationCardinality).to.equal(11);
            et.expect(r.observationCardinalityNext).to.equal(11);
        }},

        // TWAP period is still from the start

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.expect(r.twapPeriod).to.equal(await ctx.lastBlockTimestamp() - ctx.stash.timeA);
        }},

        // One more trade to wrap it around

        { action: 'cb', cb: async () => { await ctx.stash.doSwap(); }},

        // Now the twap period is shorter

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.expect(r.twapPeriod).to.be.below(await ctx.lastBlockTimestamp() - ctx.stash.timeA);
        }},

        // If we fast forward, we can get a full twap:

        { action: 'jumpTimeAndMine', time: 1800, },

        { action: 'getPrice', underlying: 'TST', onResult: async (r) => {
            et.expect(r.twapPeriod).to.equal(1800);
        }},
    ],
})



.test({
    desc: "switch uniswap3 fee pool",
    actions: ctx => [
        // Initialize uniswap pool

        { send: 'uniswapPools.TST/WETH.initialize', args: [et.ratioToSqrtPriceX96(et.c1e18, et.c1e18)], },

        // Cannot set pool pricing configuration for non-active markets

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.WETH.address, 2, et.FeeAmount.LOW], expectError: 'e/gov/underlying-not-activated', },

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, 2, et.FeeAmount.LOW], expectError: 'e/gov/underlying-not-activated', },


        // Activate euler market for TST token

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], },

        // Get current pool pricing configuration
        // It should return [2, 3000], i.e., PRICINGTYPE__UNISWAP3_TWAP and default pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([2, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // Set and get updated pool pricing configuration

        // Check current governanor admin first

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        // Set pricing configuration

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, 2, et.FeeAmount.LOW], },

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([2, et.FeeAmount.LOW, et.AddressZero]);
        }},

        // Cannot set pricingType to invalid type

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, 1, 1000], expectError: 'e/gov/pricing-type-change-not-supported', },
    ],
})



.run();
