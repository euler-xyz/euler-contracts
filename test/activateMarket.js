const et = require('./lib/eTestLib');

const PRICINGTYPE__UNISWAP3_TWAP = 2
const PRICINGTYPE__CHAINLINK = 4
const NON_ZERO_ADDRESS = '0x0000000000000000000000000000000000000001'
const NON_ZERO_ADDRESS_2 = '0x0000000000000000000000000000000000000002'

et.testSet({
    desc: "activating markets",
})


.test({
    desc: "re-activate after uniswap activation",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            ctx.stash.eTokenAddr = r;
        }},

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(ctx.stash.eTokenAddr).to.equal(r);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(PRICINGTYPE__UNISWAP3_TWAP).to.equal(r.pricingType);
        }},

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(et.AddressZero).to.equal(r);
        }},

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.UTST.address, NON_ZERO_ADDRESS], 
        },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(ctx.stash.eTokenAddr).to.equal(r);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(PRICINGTYPE__CHAINLINK).to.equal(r.pricingType);
        }},

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.UTST.address], onResult: r => {
            et.expect(NON_ZERO_ADDRESS).to.equal(r);
        }},
    ],
})


.test({
    desc: "re-activate after chainlink activation",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.UTST2.address, NON_ZERO_ADDRESS], 
        },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            ctx.stash.eTokenAddr = r;
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            et.expect(PRICINGTYPE__CHAINLINK).to.equal(r.pricingType);
        }},

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            et.expect(NON_ZERO_ADDRESS).to.equal(r);
        }},

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed',
            args: [ctx.contracts.tokens.UTST2.address, NON_ZERO_ADDRESS], 
            expectError: 'e/market/underlying-already-activated'
        },

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST2.address], },

        { call: 'markets.underlyingToEToken', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            et.expect(ctx.stash.eTokenAddr).to.equal(r);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            et.expect(PRICINGTYPE__CHAINLINK).to.equal(r.pricingType);
        }},

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.UTST2.address], onResult: r => {
            et.expect(NON_ZERO_ADDRESS).to.equal(r);
        }},
    ],
})


.test({
    desc: "invalid contracts",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.euler.address], expectError: 'e/markets/invalid-token', },

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.eTokens.eTST.address], expectError: 'e/markets/invalid-token', },
        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.dTokens.dTST.address], expectError: 'e/markets/invalid-token', },
    ],
})


.test({
    desc: "no uniswap pool",
    actions: ctx => [
        // error for permissionless activation
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/markets/pricing-type-invalid', },

        // succeeds for permissioned activation with Chainlink
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(0);
        }, },

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "pricing type invalid due to uniswap pool not initiated",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowNotInitiated(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/markets/pricing-type-invalid', },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(0);
        }, },

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "pricing type invalid due to uniswap pool other error",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowOther(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/markets/pricing-type-invalid', },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(0);
        }, },

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "pricing type invalid due to uniswap pool empty error",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        async () => {
            await (await ctx.contracts.uniswapPools['TST4/WETH'].mockSetThrowEmpty(true)).wait();
        },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/markets/pricing-type-invalid', },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(0);
        }, },

        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "activation with chainlink - non-governor",
    actions: ctx => [
        { from: ctx.wallet2, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, et.AddressZero], 
            expectError: 'e/markets/unauthorized'
        },
    ],
})


.test({
    desc: "activation with chainlink - bad chainlink address",
    actions: ctx => [
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, et.AddressZero], 
            expectError: 'e/markets/bad-chainlink-address'
        },
    ],
})


.test({
    desc: "select second fee uniswap pool",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__UNISWAP3_TWAP);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
    ],
})


.test({
    desc: "select second fee uniswap pool with chainlink",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "select third fee uniswap pool",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__UNISWAP3_TWAP);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
    ],
})


.test({
    desc: "select third fee uniswap pool with chainlink",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})



.test({
    desc: "choose pool with best liquidity",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [9000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__UNISWAP3_TWAP);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity with chainlink",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.LOW, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [9000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.LOW);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 2",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__UNISWAP3_TWAP);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 2, with chainlink",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.HIGH);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 3",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.TST4.address], },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__UNISWAP3_TWAP);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.MEDIUM);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
    ],
})


.test({
    desc: "choose pool with best liquidity, 3, with chainlink",
    actions: ctx => [
        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.MEDIUM, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [7000], },

        { action: 'createUniswapPool', pair: 'TST4/WETH', fee: et.FeeAmount.HIGH, },
        { send: 'uniswapPools.TST4/WETH.mockSetLiquidity', args: [6000], },

        { from: ctx.wallet, send: 'markets.activateMarketWithChainlinkPriceFeed', 
            args: [ctx.contracts.tokens.TST4.address, NON_ZERO_ADDRESS],
        },
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r.pricingType).to.equal(PRICINGTYPE__CHAINLINK);
            et.expect(r.pricingParameters).to.equal(et.FeeAmount.MEDIUM);
        }, },
        { call: 'markets.getChainlinkPriceFeedConfig', args: [ctx.contracts.tokens.TST4.address], onResult: r => {
            et.expect(r).to.equal(NON_ZERO_ADDRESS);
        }, },
    ],
})


.run();
