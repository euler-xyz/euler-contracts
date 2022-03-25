const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK_ETH = 4;
const PRICINGTYPE__CHAINLINK_USD = 5;
const PRICE_FEED_TIMEOUT = 10;

et.testSet({
    desc: "chainlink price feed handling",
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy mock chainlink aggregators

            ctx.contracts.AggregatorTST = await (await ctx.factories.MockAggregatorProxy.deploy(18)).deployed();
            ctx.contracts.AggregatorTST2 = await (await ctx.factories.MockAggregatorProxy.deploy(8)).deployed();
        }}
    ]
})

.test({
    desc: "chainlink pricing setup and price fetch",
    actions: ctx => [
        // Get current pool pricing configuration
        // It should return [2, 3000], i.e., PRICINGTYPE__UNISWAP3_TWAP and default pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([2, et.DefaultUniswapFee, et.AddressZero]);
        }},
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r).to.eql([2, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },
        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, ctx.contracts.AggregatorTST.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST.address);
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, ctx.contracts.AggregatorTST2.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST2.address);
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feeds params not initialized

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },
        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, ctx.contracts.AggregatorTST.address, (18 << 24) | PRICE_FEED_TIMEOUT], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST.address);
            et.expect(logs[0].args.priceFeedParams).to.equal((18 << 24) | PRICE_FEED_TIMEOUT);
        }},

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, ctx.contracts.AggregatorTST2.address, (8 << 24) | PRICE_FEED_TIMEOUT], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST2.address);
            et.expect(logs[0].args.priceFeedParams).to.equal((8 << 24) | PRICE_FEED_TIMEOUT);
        }},

        // Cannot set pool pricing configuration if fallback uniswap pool fee not specified

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, 0], 
            expectError: 'e/gov/fallback-pool-fee-not-specified', 
        },
        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, 0], 
            expectError: 'e/gov/fallback-pool-fee-not-specified', 
        },

        // Set pool pricing configuration

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK_ETH, et.DefaultUniswapFee], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
            et.expect(logs[0].args.newPricingParameter).to.equal(et.DefaultUniswapFee);
        }},
        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST2.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.newPricingParameter).to.equal(et.DefaultUniswapFee);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK_ETH, et.DefaultUniswapFee, et.AddressZero]);
        }},
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Set up the price feeds and fetch prices

            await ctx.contracts.AggregatorTST.mockSetData([1, 123456, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(123456);
            et.expect(resultTST.twapPeriod).to.equal(1);

            await ctx.contracts.AggregatorTST2.mockSetData([2, 654321, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST2 = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST2.address);
            et.expect(resultTST2.twap).to.equal(654321 * 10**10);
            et.expect(resultTST2.twapPeriod).to.equal(1);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Set up the price feeds and fetch prices

            await ctx.contracts.AggregatorTST.mockSetData([1, 123456, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(123456);
            et.expect(resultTST.currPrice).to.equal(123456);
            et.expect(resultTST.twapPeriod).to.equal(1);

            await ctx.contracts.AggregatorTST2.mockSetData([2, 654321, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST2 = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.TST2.address);
            et.expect(resultTST2.twap).to.equal(654321 * 10**10);
            et.expect(resultTST2.currPrice).to.equal(654321 * 10**10);
            et.expect(resultTST2.twapPeriod).to.equal(1);
        }},

        { action: 'cb', cb: async () => {
            // Set uniswap prices
            await ctx.updateUniswapPrice('TST/WETH', 5);
            await ctx.updateUniswapPrice('TST2/WETH', 10);

            // Set invalid prices and fetch them (we should fall back to uniswap twap and its 30 min period )

            await ctx.contracts.AggregatorTST.mockSetData([3, 0, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(5);
            et.expect(resultTST.twapPeriod).to.equal(30 * 60);

            await ctx.contracts.AggregatorTST2.mockSetData([4, 654321, (await ctx.lastBlockTimestamp()) - PRICE_FEED_TIMEOUT, 0, 0]);
            const resultTST2 = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST2.address);
            et.expect(resultTST2.twap).to.equal(10);
            et.expect(resultTST2.twapPeriod).to.equal(30 * 60);
        }},
    ],
})

.run();
