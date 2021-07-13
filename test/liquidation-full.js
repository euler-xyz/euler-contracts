const et = require('./lib/eTestLib');

et.testSet({
    desc: "liquidation full",
    fixture: "real-uniswap",

    preActions: ctx => [
        { send: 'tokens.WETH.mint', args: [ctx.wallet.address, et.eth(500)], },
        { send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.WETH.approve', args: [ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256,], },

        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(500)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256,], },

        { send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST2.approve', args: [ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256,], },

        // wallet will be lender

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], },

        // wallet2 will be borrower, using TST2 as collateral

        { send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
    ],
})


.test({
    desc: "end-to-end",
    actions: ctx => [
        { send: 'simpleUniswapPeriphery.mint', args: [ctx.contracts.uniswapPools["TST/WETH"].address, ctx.wallet.address, -887220, 887220, et.eth('50.0')], },
        { send: 'simpleUniswapPeriphery.mint', args: [ctx.contracts.uniswapPools["TST2/WETH"].address, ctx.wallet.address, -887220, 887220, et.eth('50.0')], },

        // Set TST price to 1.1

        { action: 'doUniswapSwap', tok: 'TST', dir: 'buy', amount: et.eth(5), priceLimit: 1.2, },
        { action: 'jumpTimeAndMine', time: 3600, },

        { action: 'getPrice', underlying: 'TST', dump:1},
        { action: 'getPrice', underlying: 'TST2', dump:1},


        // Do a borrow

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth('2.2')], },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], dump:1},



        { action: 'doUniswapSwap', tok: 'TST', dir: 'buy', amount: et.eth(20), priceLimit: 1.5, },
        { action: 'jumpTimeAndMine', time: 3600, },
        { action: 'getPrice', underlying: 'TST', dump:1},

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], dump:1},


        /*
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
        */
    ],
})



.run();
