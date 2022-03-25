const et = require('./lib/eTestLib');
const { abi } = require('./vendor-artifacts/EACAggregatorProxy.json');

const USDC_ETH_AggregatorProxy = '0x986b5E1e1755e3C2440e960477f25201B0a8bbD4';
const BAT_USD_AggregatorProxy = '0x9441D7556e7820B5ca42082cfa99487D56AcA958';
const USDC_ETH_AggregatorProxyTimeout = 24 * 60 * 60;
const USDC_ETH_AggregatorProxyDecimals = 18;
const BAT_USD_AggregatorProxyTimeout = 1 * 60 * 60;
const BAT_USD_AggregatorProxyDecimals = 8;
const PRICINGTYPE__CHAINLINK_ETH = 4;
const PRICINGTYPE__CHAINLINK_USD = 5;
const USDC_ETH_APPROX_EXCHANGE_RATE = '330000000000000';
const BAT_USD_APPROX_EXCHANGE_RATE = '850000000000000000';

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

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, 500], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, USDC_ETH_AggregatorProxy, 0], onLogs: logs => {
        et.expect(logs.length).to.equal(1); 
        et.expect(logs[0].name).to.equal('GovSetPriceFeed');
        et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
        et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
        et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(USDC_ETH_AggregatorProxy.toLowerCase());
        et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feed params not initialized

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, 500], 
        expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, USDC_ETH_AggregatorProxy, (USDC_ETH_AggregatorProxyDecimals << 24) | USDC_ETH_AggregatorProxyTimeout], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(USDC_ETH_AggregatorProxy.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal((USDC_ETH_AggregatorProxyDecimals << 24) | USDC_ETH_AggregatorProxyTimeout);
        }},

        // Cannot set pool pricing configuration if fallback uniswap pool fee not specified

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, 0], 
            expectError: 'e/gov/fallback-pool-fee-not-specified', 
        },

        // Set pool pricing configuration

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_ETH, 500], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.USDC.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK_ETH);
            et.expect(logs[0].args.newPricingParameter).to.equal(500);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.USDC.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK_ETH, 500, et.AddressZero]);
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
            et.expect(result.currPrice).to.be.within(et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(USDC_ETH_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},
    ],
})

.test({
    desc: "set up and fetch BAT/USD price",
    actions: ctx => [
        // Get current pool pricing configuration
        // It should return [2, 3000], i.e., PRICINGTYPE__UNISWAP3_TWAP and 0.3% pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.BAT.address], onResult: r => {
            et.expect(r).to.eql([2, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.USDC.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.BAT.address, PRICINGTYPE__CHAINLINK_USD, BAT_USD_AggregatorProxy, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.BAT.address.toLowerCase());
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(BAT_USD_AggregatorProxy.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feed params not initialized

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.BAT.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.BAT.address, PRICINGTYPE__CHAINLINK_USD, BAT_USD_AggregatorProxy, (BAT_USD_AggregatorProxyDecimals << 24) | BAT_USD_AggregatorProxyTimeout], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.BAT.address.toLowerCase());
            et.expect(logs[0].args.pricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(BAT_USD_AggregatorProxy.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal((BAT_USD_AggregatorProxyDecimals << 24) | BAT_USD_AggregatorProxyTimeout);
        }},

        // Cannot set pool pricing configuration if fallback uniswap pool fee not specified

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.BAT.address, PRICINGTYPE__CHAINLINK_USD, 0], 
            expectError: 'e/gov/fallback-pool-fee-not-specified', 
        },

        // Set pool pricing configuration

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.BAT.address, PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.BAT.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK_USD);
            et.expect(logs[0].args.newPricingParameter).to.equal(et.DefaultUniswapFee);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.BAT.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CHAINLINK_USD, et.DefaultUniswapFee, et.AddressZero]);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(BAT_USD_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.BAT.address);
            et.expect(result.twap).to.be.within(et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(BAT_USD_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.BAT.address);
            et.expect(result.twap).to.be.within(et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.currPrice).to.be.within(et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(95).div(100), et.BN(BAT_USD_APPROX_EXCHANGE_RATE).mul(105).div(100));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},
    ],
})

.run();
