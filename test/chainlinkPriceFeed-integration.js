const et = require('./lib/eTestLib');
const { abi } = require('./vendor-artifacts/EACAggregatorProxy.json');

const USDC_ETH_AggregatorProxy = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4';
const USDC_ETH_AggregatorProxyTimeout = 24 * 60 * 60;
const USDC_ETH_AggregatorProxyDecimals = 18;
const PRICINGTYPE__CHAINLINK = 5;
const USDC_ETH_APPROX_EXCHANGE_RATE = '330000000000000';

et.testSet({
    desc: "chainlink price feed integration",
    fixture: 'mainnet-fork',
    forkAtBlock: 14450000
})

.test({
    desc: "set up and fetch USDC/ETH price",
    actions: ctx => [
        // Get current pool pricing configuration
        // It should return [2, 500], i.e., PRICINGTYPE__UNISWAP3_TWAP and 0.05% pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.USDC.address], onResult: r => {
            et.expect(r).to.eql([2, 500, et.AddressZero]);
        }},

        // Get price feed configuration (should be default)

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK], onResult: r => {
            et.expect(r).to.eql([et.AddressZero, et.BN(0)]);
        }},

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, 0], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, USDC_ETH_AggregatorProxy, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(USDC_ETH_AggregatorProxy.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feed params not initialized

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, 0], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, USDC_ETH_AggregatorProxy, (USDC_ETH_AggregatorProxyDecimals << 24) | USDC_ETH_AggregatorProxyTimeout], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(USDC_ETH_AggregatorProxy.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal((USDC_ETH_AggregatorProxyDecimals << 24) | USDC_ETH_AggregatorProxyTimeout);
        }},

        // Get price feed configuration

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK], onResult: r => {
            et.expect(r).to.eql([USDC_ETH_AggregatorProxy, et.BN((USDC_ETH_AggregatorProxyDecimals << 24) | USDC_ETH_AggregatorProxyTimeout)]);
        }},

        // Set pool pricing configuration

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(0);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.USDC.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK, 0, et.AddressZero]);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(USDC_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.USDC.address);
            et.expect(result.twap).to.be.within(et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(USDC_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.USDC.address);
            et.expect(result.twap).to.be.within(et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},
    ],
})

.run();
