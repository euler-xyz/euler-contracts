const et = require('./lib/eTestLib');
const { abi } = require('./vendor-artifacts/EACAggregatorProxy.json');

const USDC_ETH_AggregatorProxy = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4';
const PRICINGTYPE__CHAINLINK = 4;
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

        // Get chainlink price feeds configuration (should be default)

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.USDC.address], onResult: r => {
            et.expect(r).to.eql(et.AddressZero);
        }},

        // Cannot set pool pricing configuration if chainlink price feed hadn't been set up previously

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK, 0], 
            expectError: 'e/gov/chainlink-price-feed-not-initialized', 
        },

        // Set up the chainlink price feeds

        { send: 'governance.setChainlinkPriceFeed', args: 
            [ctx.contracts.tokens.USDC.address, USDC_ETH_AggregatorProxy], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(USDC_ETH_AggregatorProxy.toLowerCase());
        }},

        // Get chainlink price feed configuration

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.USDC.address], onResult: r => {
            et.expect(r).to.eql(USDC_ETH_AggregatorProxy);
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

            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.USDC.address);
            et.expect(result.twap).to.be.within(et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.USDC.address);
            et.expect(result.twap).to.be.within(et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }},
    ],
})

.run();
