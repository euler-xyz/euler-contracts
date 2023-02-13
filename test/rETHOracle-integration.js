const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK = 4;
const RETH_ETH_APPROX_EXCHANGE_RATE = '1055000000000000000';
const RETH_ETH_APPROX_UNISWAP_PRICE = '1070000000000000000';

et.testSet({
    desc: "rETH/ETH oracle integration",
    fixture: 'mainnet-fork',
    forkAtBlock: 16622000,
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy mock rETH and corresponding mock oracle

            ctx.contracts.MockRETH = await (await ctx.factories.MockRETH.deploy()).deployed();
            ctx.contracts.RETHOracleMock = await (await ctx.factories.RETHOracle.deploy(ctx.contracts.MockRETH.address)).deployed();
        }}
    ]
})

.test({
    desc: "set up and fetch RETH/ETH price",
    actions: ctx => [
        // Set up the chainlink oracle

        { send: 'governance.setChainlinkPriceFeed', args: 
        [ctx.contracts.tokens.RETH.address, ctx.contracts.RETHOracle.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.RETH.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.RETHOracle.address.toLowerCase());
        }},

        // Does not revert when setting pricing configuration, even if the new pricing params are 0 (no uniswap fallback)

        { send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.RETH.address, PRICINGTYPE__CHAINLINK, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.RETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(0);
        }},

        // test getPrice
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.RETH.address], onResult: result => {
            // Fetch real world price

            et.expect(result.twap).to.be.within(et.BN(RETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(RETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // test getPriceFull

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.RETH.address], onResult: result => {
            // Fetch real world price

            et.expect(result.twap).to.be.within(et.BN(RETH_ETH_APPROX_EXCHANGE_RATE).mul(995).div(1000), et.BN(RETH_ETH_APPROX_EXCHANGE_RATE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // Change configuration to point to mock oracle

        { send: 'governance.setChainlinkPriceFeed', args: 
            [ctx.contracts.tokens.RETH.address, ctx.contracts.RETHOracleMock.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetChainlinkPriceFeed');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.RETH.address.toLowerCase());
            et.expect(logs[0].args.chainlinkAggregator.toLowerCase()).to.equal(ctx.contracts.RETHOracleMock.address.toLowerCase());
        }},

        // set the exchange rate to 5 in the rETH mock

        { send: 'MockRETH.mockSetData', args: [5], },

        // test getPrice

        { call: 'exec.getPrice', args: [ctx.contracts.tokens.RETH.address], onResult: result => {

            et.expect(result.twap).to.equal(5);
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // test getPriceFull

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.RETH.address], onResult: result => {

            et.expect(result.twap).to.equal(5);
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(0);
        }, },

        // make the rETH contract return erroneous (too big) value for the exchange rate leading to an overflow

        { send: 'MockRETH.mockSetData', args: [et.ethers.constants.MaxUint256], },

        // Due to rETH contract returning erroneous value as exchange rate, the price will revert with overflow
        // The overflow will be nicely handled by the callChainlinkLatestAnswer() RM function
        // As uniswap fallback is not configured, it should revert

        // test getPrice

        { send: 'exec.getPrice', args: [ctx.contracts.tokens.RETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // test getPriceFull

        { send: 'exec.getPriceFull', args: [ctx.contracts.tokens.RETH.address], 
            expectError: 'e/unable-to-get-the-price', 
        },

        // configure uniswap fallback pool

        { send: 'governance.setPricingConfig', args: 
        [ctx.contracts.tokens.RETH.address, PRICINGTYPE__CHAINLINK, 500], onLogs: logs => {
            et.expect(logs.length).to.equal(1); 
            et.expect(logs[0].name).to.equal('GovSetPricingConfig');
            et.expect(logs[0].args.underlying.toLowerCase()).to.equal(ctx.contracts.tokens.RETH.address.toLowerCase());
            et.expect(logs[0].args.newPricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(logs[0].args.newPricingParameter).to.equal(500);
        }},

        // even though the rETH oracle still returns incorrect price of 0, uniswap fallback oracle fetches correct price
        // test getPrice

        { call: 'exec.getPrice', args: [ctx.contracts.tokens.RETH.address], onResult: result => {
            // Fetch real world uniswap price

            et.expect(result.twap).to.be.within(et.BN(RETH_ETH_APPROX_UNISWAP_PRICE).mul(995).div(1000), et.BN(RETH_ETH_APPROX_UNISWAP_PRICE).mul(1005).div(1000));
            et.expect(result.twapPeriod).to.equal(1800);
        }, },

        // test getPriceFull

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.RETH.address], onResult: result => {
            // Fetch real world uniswap price

            et.expect(result.twap).to.be.within(et.BN(RETH_ETH_APPROX_UNISWAP_PRICE).mul(995).div(1000), et.BN(RETH_ETH_APPROX_UNISWAP_PRICE).mul(1005).div(1000));
            et.expect(result.currPrice).to.be.equal(result.twap);
            et.expect(result.twapPeriod).to.equal(1800);
        }, },
    ],
})

.run();
