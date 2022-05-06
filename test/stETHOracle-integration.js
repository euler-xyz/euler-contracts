const et = require('./lib/eTestLib');
const { abi } = require('./vendor-artifacts/EACAggregatorProxy.json');

const STETH_ETH_AggregatorProxy = '0x86392dC19c0b719886221c78AB11eb8Cf5c52812';
const PRICINGTYPE__CUSTOM = 4;
const PRICINGPARAMS__QUOTE_TYPE_ETH = 0;
const STETH_UNDERLYING = 1;
const WSTETH_UNDERLYING = 2;
const STETH_ETH_APPROX_EXCHANGE_RATE = '1000000000000000000';
const WSTETH_ETH_APPROX_EXCHANGE_RATE = '1070000000000000000';

et.testSet({
    desc: "stETH and wstETH custom price oracle integration",
    fixture: 'mainnet-fork',
    forkAtBlock: 14707000,
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy mock chainlink aggregator and corresponding custom oracle

            ctx.contracts.MockChainlinkAggregator = await (await ctx.factories.MockAggregatorProxy.deploy(18)).deployed();
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, await ctx.lastBlockTimestamp(), 0, 0]);

            ctx.contracts.StETHEulerPriceOracleMock = await (
                await ctx.factories.StETHEulerPriceOracle.deploy(
                    ctx.tokenSetup.riskManagerSettings.referenceAsset,
                    ctx.tokenSetup.testing.forkTokens.STETH.address,
                    ctx.tokenSetup.testing.forkTokens.WSTETH.address,
                    ctx.contracts.MockChainlinkAggregator.address,
                    ctx.tokenSetup.riskManagerSettings.uniswapFactory,
                    ctx.tokenSetup.riskManagerSettings.uniswapPoolInitCodeHash,
                )
            ).deployed();
        }}
    ]
})

.test({
    desc: "set up and fetch STETH/ETH and WSTETH/ETH price",
    actions: ctx => [
        // Get current pools pricing configuration
        // It should return [2, 3000], i.e., PRICINGTYPE__UNISWAP3_TWAP and 0.3% pool fee for STETH
        // and [2, 500], i.e., PRICINGTYPE__UNISWAP3_TWAP and 0.05% pool fee for WSTETH

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.STETH.address], onResult: r => {
            et.expect(r).to.eql([2, 3000, et.AddressZero]);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.WSTETH.address], onResult: r => {
            et.expect(r).to.eql([2, 500, et.AddressZero]);
        }},

        // Get price feed configuration (should be default)

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.STETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM], onResult: r => {
            et.expect(r).to.eql([et.AddressZero, et.BN(0)]);
        }},

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.WSTETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM], onResult: r => {
            et.expect(r).to.eql([et.AddressZero, et.BN(0)]);
        }},

        // Cannot set pool pricing configuration if price feeds hadn't been set up previously

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.STETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], 
            expectError: 'e/gov/price-feed-not-initialized', 
        },  

        // Set up the price feeds, without params

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.STETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracle.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.STETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracle.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        { send: 'governance.setPriceFeed', args: 
        [ctx.contracts.tokens.WSTETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracle.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracle.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(0);
        }},

        // Cannot set pool pricing configuration if price feed params not initialized

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.STETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], 
            expectError: 'e/gov/price-feed-params-not-initialized', 
        },     

        // Set up the price feeds

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.STETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracle.address, STETH_UNDERLYING], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.STETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracle.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(STETH_UNDERLYING);
        }},

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.WSTETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracle.address, WSTETH_UNDERLYING], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracle.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(WSTETH_UNDERLYING);
        }},

        // Get price feed configuration (should be set at this point)

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.STETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM], onResult: r => {
            et.expect(r).to.eql([ctx.contracts.StETHEulerPriceOracle.address, et.BN(STETH_UNDERLYING)]);
        }},

        { call: 'markets.getPriceFeedConfig', args: [ctx.contracts.tokens.WSTETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM], onResult: r => {
            et.expect(r).to.eql([ctx.contracts.StETHEulerPriceOracle.address, et.BN(WSTETH_UNDERLYING)]);
        }},        

        // Set pool pricing configuration

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.STETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.STETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.newPricingParameter).to.equal(PRICINGPARAMS__QUOTE_TYPE_ETH << 24);
        }},

        { from: ctx.wallet, send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CUSTOM, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24)], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.newPricingParameter).to.equal(PRICINGPARAMS__QUOTE_TYPE_ETH << 24);
        }},

        // Get current pool pricing configuration

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.STETH.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CUSTOM, PRICINGPARAMS__QUOTE_TYPE_ETH << 24, et.AddressZero]);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.WSTETH.address], onResult: r => {
            et.expect(r).to.eql([PRICINGTYPE__CUSTOM, PRICINGPARAMS__QUOTE_TYPE_ETH << 24, et.AddressZero]);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(STETH_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(STETH_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(STETH_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        { action: 'cb', cb: async () => {
            // Fetch real world price

            const AggregatorProxy = new et.ethers.Contract(STETH_ETH_AggregatorProxy, abi, et.ethers.provider);
            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},


        // Set up the price feeds to point to mock aggregator

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.STETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracleMock.address, STETH_UNDERLYING], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.STETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracleMock.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(STETH_UNDERLYING);
        }},

        { send: 'governance.setPriceFeed', args: 
            [ctx.contracts.tokens.WSTETH.address, (PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM, ctx.contracts.StETHEulerPriceOracleMock.address, WSTETH_UNDERLYING], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.priceFeedLookupParam).to.equal((PRICINGPARAMS__QUOTE_TYPE_ETH << 24) | PRICINGTYPE__CUSTOM);
            et.expect(logs[0].args.priceFeed.toLowerCase()).to.equal(ctx.contracts.StETHEulerPriceOracleMock.address.toLowerCase());
            et.expect(logs[0].args.priceFeedParams).to.equal(WSTETH_UNDERLYING);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch mocked price

            const AggregatorProxy = new et.ethers.Contract(ctx.contracts.MockChainlinkAggregator.address, abi, et.ethers.provider);
            let result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.equal(1000);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
            
            result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(1070);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch mocked price

            const AggregatorProxy = new et.ethers.Contract(ctx.contracts.MockChainlinkAggregator.address, abi, et.ethers.provider);
            let result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.equal(1000);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));

            result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(1070);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // invalidate the mock price feed by setting incorrect timestamp
        // check prices again

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, (await ctx.lastBlockTimestamp()) - 24 * 60 * 60, 0, 0]);
            
            let result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(30 * 60);
            
            result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(30 * 60);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, (await ctx.lastBlockTimestamp()) - 24 * 60 * 60, 0, 0]);

            let result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(30 * 60);

            result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(30 * 60);
        }},

        // invalidate the mock price feed by setting incorrect price
        // check prices again

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 0, await ctx.lastBlockTimestamp(), 0, 0]);
            
            let result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(30 * 60);
            
            result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(30 * 60);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 0, await ctx.lastBlockTimestamp(), 0, 0]);

            let result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.within(et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(STETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(30 * 60);

            result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(30 * 60);
        }},

        // set the mock price feed correctly
        // check prices again

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch mocked price again

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 500, await ctx.lastBlockTimestamp(), 0, 0]);
            
            const AggregatorProxy = new et.ethers.Contract(ctx.contracts.MockChainlinkAggregator.address, abi, et.ethers.provider);
            let result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.equal(500);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
            
            result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(535);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch mocked price again

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 500, await ctx.lastBlockTimestamp(), 0, 0]);

            const AggregatorProxy = new et.ethers.Contract(ctx.contracts.MockChainlinkAggregator.address, abi, et.ethers.provider);
            let result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.STETH.address);
            et.expect(result.twap).to.be.equal(500);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));

            result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(535);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal((await ctx.lastBlockTimestamp()) - (await AggregatorProxy.latestTimestamp()));
        }},
    ],
})

.run();
