const et = require('./lib/eTestLib');

const PRICINGTYPE__CHAINLINK = 4
const NON_ZERO_ADDRESS = '0x0000000000000000000000000000000000000001'

et.testSet({
    desc: "activating markets without uniswap",
    fixture: 'testing-no-uniswap'
})


.test({
    desc: "re-activate",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.WETH.address, NON_ZERO_ADDRESS], 
        },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.WETH.address], onResult: r => {
            ctx.stash.eTokenAddr = r;
        }},

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.WETH.address, NON_ZERO_ADDRESS], 
            expectError: 'e/market/underlying-already-activated'
        },

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.WETH.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.WETH.address], onResult: r => {
            et.expect(ctx.stash.eTokenAddr).to.equal(r);
        }},
    ],
})


.test({
    desc: "invalid contracts",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.euler.address, NON_ZERO_ADDRESS], 
            expectError: 'e/markets/invalid-token', 
        },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.WETH.address, NON_ZERO_ADDRESS], 
        },
        { action: 'cb', cb: async () => {
            const eWETH = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens.WETH.address);
            const dWETH = await ctx.contracts.markets.underlyingToDToken(ctx.contracts.tokens.WETH.address);

            let msg;
            await ctx.contracts.markets.activateMarketWithChainlinkPriceFeed(eWETH, NON_ZERO_ADDRESS)
            .catch(e => {
                msg = e.message;
            });
            et.expect(msg).to.contains('e/markets/invalid-token');

            msg = ""
            await ctx.contracts.markets.activateMarketWithChainlinkPriceFeed(dWETH, NON_ZERO_ADDRESS)
            .catch(e => {
                msg = e.message;
            });
            et.expect(msg).to.contains('e/markets/invalid-token');
        } },
    ],
})


.test({
    desc: "no uniswap factory",
    actions: ctx => [
        // error for permissionless activation
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST.address], expectError: 'e/markets/pricing-type-invalid', },

        // succeeds for permissioned activation with Chainlink
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST.address, NON_ZERO_ADDRESS],
        },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(0);
        }, },

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})

.run();
