const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK = 4;
const WSTETH_ETH_APPROX_EXCHANGE_RATE = '1070000000000000000';

et.testSet({
    desc: "wstETH/ETH oracle integration",
    fixture: 'mainnet-fork',
    forkAtBlock: 14707000,
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy mock chainlink aggregator, mock stETH and corresponding mock oracles

            ctx.contracts.MockChainlinkAggregator = await (await ctx.factories.MockAggregatorProxy.deploy(18)).deployed();
            ctx.contracts.MockStETH = await (await ctx.factories.MockStETH.deploy()).deployed();

            // mock 1 has only chainlink oracle mocked
            ctx.contracts.WSTETHOracleMock1 = await (
                await ctx.factories.WSTETHOracle.deploy(
                    ctx.tokenSetup.testing.forkTokens.STETH.address,
                    ctx.contracts.MockChainlinkAggregator.address,
                )
            ).deployed();

            // mock 2 has both chainlink oracle and stETH token mocked
            ctx.contracts.WSTETHOracleMock2 = await (
                await ctx.factories.WSTETHOracle.deploy(
                    ctx.contracts.MockStETH.address,
                    ctx.contracts.MockChainlinkAggregator.address,
                )
            ).deployed();
        }}
    ]
})

.test({
    desc: "set up and fetch WSTETH/ETH price",
    actions: ctx => [
        // Get current pools pricing configuration
        // It should return [2, 500], i.e., PRICINGTYPE__UNISWAP3_TWAP and 0.05% pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.WSTETH.address], onResult: r => {
            et.expect(r).to.eql([2, 500, et.AddressZero]);
        }},

        // Get chainlink oracle configuration (should be unconfigured)

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.WSTETH.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }},

        // Cannot set pricing configuration if chainlink oracle hadn't been set up before

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CHAINLINK, 0], 
            expectError: 'e/gov/chainlink-price-feed-not-initialized', 
        },

        // Set up the chainlink oracle

        { send: 'governance.setChainlinkPriceFeed', args: 
        [ctx.contracts.tokens.WSTETH.address, ctx.contracts.WSTETHOracle.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.WSTETHOracle.address.toLowerCase());
        }},

        // Get chainlink oracle configuration

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.WSTETH.address], onResult: r => {
            et.expect(r).to.equal(ctx.contracts.WSTETHOracle.address);
        }},   

        // Does not revert when setting pricing configuration, even if the new pricing params are 0 (no uniswap fallback)

        { send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CHAINLINK, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(0);
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world price
            // at fork block height 1 stETH ~= 1 ETH

            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world price
            // at fork block height 1 stETH ~= 1 ETH

            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // Change configuration to point to mock oracle 1 with price of 1000 manually set

        { action: 'cb', cb: async () => {
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, 0, 0, 0]);
        }},

        { send: 'governance.setChainlinkPriceFeed', args: 
            [ctx.contracts.tokens.WSTETH.address, ctx.contracts.WSTETHOracleMock1.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.WSTETHOracleMock1.address.toLowerCase());
        }},

        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch mocked price

            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(1070);
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch mocked price

            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(1070);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // invalidate the mock chainlink price feed by returning price of 0
        { action: 'cb', cb: async () => {
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 0, 0, 0, 0]);
        }},

        // Due to incorrect chainlink price, the price returned by wstETH oracle will be 0
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // set the mock chainlink price feed correctly to price of 500
        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch mocked price again

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 500, 0, 0, 0]);

            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(535);
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch mocked price again

            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 500, 0, 0, 0]);

            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.equal(535);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }},

        // Change configuration to point to mock oracle 2

        { send: 'governance.setChainlinkPriceFeed', args: 
            [ctx.contracts.tokens.WSTETH.address, ctx.contracts.WSTETHOracleMock2.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.WSTETHOracleMock2.address.toLowerCase());
        }},

        // set the mock chainlink price feed correctly to price of 1000
        // make the stETH contract revert when trying to fetch the exchange rate

        { action: 'cb', cb: async () => {
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, 0, 0, 0]);
            await ctx.contracts.MockStETH.setRevert(true);
            await ctx.contracts.MockStETH.setMockData(1, 1);
        }},

        // Due to stETH contract revering, the price returned by wstETH oracle will be 0
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // set the mock chainlink price feed correctly to price of 1000
        // make the stETH contract return 0 for the exchange rate

        { action: 'cb', cb: async () => {
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, 1000, 0, 0, 0]);
            await ctx.contracts.MockStETH.setRevert(false);
            await ctx.contracts.MockStETH.setMockData(0, 1);
        }},

        // Due to stETH contract returning 0 as exchange rate, the price returned by wstETH oracle will be 0
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // set the mock chainlink price feed correctly to price of 1e18
        // make the stETH contract return erroneous (too big) value for the exchange rate leading to an overflow

        { action: 'cb', cb: async () => {
            await ctx.contracts.MockChainlinkAggregator.mockSetData([1, et.ethers.utils.parseEther('1'), 0, 0, 0]);
            await ctx.contracts.MockStETH.setRevert(false);
            await ctx.contracts.MockStETH.setMockData(et.ethers.constants.MaxUint256, 1);
        }},

        // Due to stETH contract returning erroneous value as exchange rate, the price will revert with overflow
        // The overflow will be nicely handled by the callChainlinkLatestAnswer() RM function
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.WSTETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // configure uniswap fallback pool

        { send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.WSTETH.address, PRICINGTYPE__CHAINLINK, 500], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.WSTETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(500);
        }},

        // even though the wstETH oracle still returns incorrect price of 0, uniswap fallback oracle fetches correct price
        // test getPrice

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price
            // at fork block height 1 stETH ~= 1 ETH

            const result = await ctx.contracts.exec.getPrice(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(1800);
        }},

        // test getPriceFull

        { action: 'cb', cb: async () => {
            // Fetch real world uniswap price
            // at fork block height 1 stETH ~= 1 ETH

            const result = await ctx.contracts.exec.getPriceFull(ctx.contracts.tokens.WSTETH.address);
            et.expect(result.twap).to.be.within(et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(WSTETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(1800);
        }},
    ],
})

.test({
    desc: "test misc functions of WSTETH/ETH oracle",
    actions: ctx => [
        // test decimals function

        { action: 'cb', cb: async () => {
            const result = await ctx.contracts.WSTETHOracle.decimals();
            et.expect(result).to.equal(18);
        }},

        // test description function

        { action: 'cb', cb: async () => {
            const result = await ctx.contracts.WSTETHOracle.description();
            et.expect(result).to.equal("WSTETH/ETH");
        }},

        // test latestTimestamp function

        { action: 'cb', cb: async () => {
            const result = await ctx.contracts.WSTETHOracle.latestTimestamp();
            et.expect(result).to.equal(1651526454);
        }},
    ]
})

.run();
