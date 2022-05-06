const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK = 5;
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

        // Get price feed configuration (should be default)

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK], onResult: r => {
            et.expect(r).to.eql([et.AddressZero, et.BN(0)]);
        }},

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, ctx.contracts.AggregatorTST.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.priceFeedLookupParam).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST.address);
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feeds params not initialized

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, ctx.contracts.AggregatorTST.address, (18 << 24) | PRICE_FEED_TIMEOUT], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.priceFeedLookupParam).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.priceFeed).to.equal(ctx.contracts.AggregatorTST.address);
            et.expect(logs[0].args.priceFeedParams).to.equal((18 << 24) | PRICE_FEED_TIMEOUT);
        }},

        // Get price feed configuration (should be default)

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK], onResult: r => {
            et.expect(r).to.eql([ctx.contracts.AggregatorTST.address, et.BN((18 << 24) | PRICE_FEED_TIMEOUT)]);
        }},

        // Set pool pricing configuration

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, et.DefaultUniswapFee], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(et.DefaultUniswapFee);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Set up the price feeds and fetch prices

            await ctx.contracts.AggregatorTST.mockSetData([1, 123456, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(123456);
            et.expect(resultTST.twapPeriod).to.equal(1);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Set up the price feeds and fetch prices

            await ctx.contracts.AggregatorTST.mockSetData([1, 123456, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(123456);
            et.expect(resultTST.currPrice).to.equal(resultTST.twap);
            et.expect(resultTST.twapPeriod).to.equal(1);
        }},

        { action: 'cb', cb: async () => {
            // Set uniswap prices
            await ctx.updateUniswapPrice('TST/WETH', 5);

            // Set invalid prices and fetch them (we should fall back to uniswap twap and its 30 min period )

            await ctx.contracts.AggregatorTST.mockSetData([3, 0, await ctx.lastBlockTimestamp(), 0, 0]);
            const resultTST = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST.address);
            et.expect(resultTST.twap).to.equal(5);
            et.expect(resultTST.twapPeriod).to.equal(30 * 60);
        }},

        // Set pool pricing configuration with no uniswap fallback poool

        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(0);
        }},

        { action: 'cb', cb: async () => {
            // Set uniswap prices
            await ctx.updateUniswapPrice('TST/WETH', 5);

            // Set invalid prices and fetch them (we should revert as there's no uniswap fallback pool)

            await ctx.contracts.AggregatorTST.mockSetData([3, 0, await ctx.lastBlockTimestamp(), 0, 0]);
            let errMsg = '';
            try {
                await ctx.contracts.exec.getPrice(ctx.contracts.tokens.TST.address);
            } catch (e) {
                errMsg = e.message;
            }
            et.expect(errMsg).to.contains('e/unable-to-get-the-price');
        }},
    ],
})

.run();
