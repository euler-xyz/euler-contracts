const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK = 4;

et.testSet({
    desc: "rETH/ETH oracle",
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy mock rETH and corresponding mock oracle

            ctx.contracts.MockRETH = await (await ctx.factories.MockRETH.deploy()).deployed();

            ctx.contracts.RETHOracle = await (await ctx.factories.RETHOracle
                    .deploy(ctx.contracts.MockRETH.address)).deployed();
        }}
    ]
})

.test({
    desc: "set up and fetch RETH/ETH price",
    actions: ctx => [
        // Get current pools pricing configuration
        // It should return [2, 3000], i.e., PRICINGTYPE__UNISWAP3_TWAP and default 0.3% pool fee

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.eql([2, 3000, et.AddressZero]);
        }},

        // Get chainlink oracle configuration (should be unconfigured)

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }},

        // Cannot set pricing configuration if chainlink oracle hadn't been set up before

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, 0], 
            expectError: 'e/gov/chainlink-price-feed-not-initialized', 
        },

        // Set up the chainlink oracle to the mock

        { send: 'governance.setChainlinkPriceFeed', args: 
            [ctx.contracts.tokens.TST.address, ctx.contracts.RETHOracle.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.TST.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.RETHOracle.address.toLowerCase());
        }},

        // Get chainlink oracle configuration

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.equal(ctx.contracts.RETHOracle.address);
        }},   

        // Does not revert when setting pricing configuration, even if the new pricing params are 0 (no uniswap fallback)

        { send: 'governance.setPricingConfig', args: 
            [ctx.contracts.tokens.TST.address, PRICINGTYPE__CHAINLINK, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.TST.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(0);
        }},

        // Set the exchange rate to 1.3

        { send: 'MockRETH.mockSetData', args: [et.ethers.utils.parseEther('1.3')], },

        // test getPrice

        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], onResult: result => {
            et.expect(result.twap).to.be.equal(et.ethers.utils.parseEther('1.3'));
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // test getPriceFull

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], onResult: result => {
            et.expect(result.twap).to.be.equal(et.ethers.utils.parseEther('1.3'));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // make the rETH contract revert when trying to fetch the exchange rate

        { send: 'MockRETH.mockSetRevert', args: [true], },
        { send: 'MockRETH.mockSetData', args: [1], },

        // Due to rETH contract revering, the price returned by rETH oracle will be 0
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // make the rETH contract return 0 for the exchange rate

        { send: 'MockRETH.mockSetRevert', args: [false], },
        { send: 'MockRETH.mockSetData', args: [0], },

        // Due to rETH contract returning 0 as exchange rate, the price returned by rETH oracle will be 0
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // make the rETH contract return erroneous (too big) value for the exchange rate leading to an overflow
        { send: 'MockRETH.mockSetData', args: [et.ethers.constants.MaxUint256], },

        // Due to rETH contract returning erroneous value as exchange rate, the price will revert with overflow
        // The overflow will be nicely handled by the callChainlinkLatestAnswer() RM function
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], 
            expectError: 'e/unable-to-get-the-price', 
        },
    ],
})

.test({
    desc: "test misc functions of RETH/ETH oracle",
    actions: ctx => [
        // test decimals function

        { call: 'RETHOracle.decimals', onResult: r => {
            et.expect(r).to.equal(18);
        }, },

        // test description function

        { call: 'RETHOracle.description', onResult: r => {
            et.expect(r).to.equal("RETH / ETH");
        }, },

        // test latestTimestamp function
        { action: 'cb', cb: async () => {
            ctx.currentBlockTimestamp_1 = (await et.ethers.provider.getBlock('latest')).timestamp;
            const latestTimestamp = await ctx.contracts.RETHOracle.latestTimestamp();
            
            et.expect(latestTimestamp).to.eq(ctx.currentBlockTimestamp_1);
        }},

        { action: 'jumpTimeAndMine', time: 10000, },

        { action: 'cb', cb: async () => {
            ctx.currentBlockTimestamp_2 = (await et.ethers.provider.getBlock('latest')).timestamp;
            const latestTimestamp = await ctx.contracts.RETHOracle.latestTimestamp();
            
            et.expect(latestTimestamp).to.eq(ctx.currentBlockTimestamp_2);
            et.expect(ctx.currentBlockTimestamp_2).to.greaterThan(ctx.currentBlockTimestamp_1);
        }},
    ]
})

.run();
