const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "overrides",

    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),
        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2', },
        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '0.5', },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.25', },

        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, borrowFactor: .5, }, },
    ],
})



.test({
    desc: "override basic",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        // Account starts off normal, with single collateral and single borrow

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0.5, .001); // 0.1 * 2 / 0.4
            et.equals(r.collateralValue, 3.75, .001); // 10 * 0.5 * 0.75
            et.assert(r.overrideCollateralValue.eq(0));
        }, },

        // Override is added for this liability/collateral pair

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.97 * 4e9),
            },
        ], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0.2, .001); // 0.1 * 2
            et.equals(r.collateralValue, 4.85, .001); // 10 * 0.5 * 0.97
            et.assert(r.overrideCollateralValue.gt(0));
        }, },

        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.1)], },

        // Additional borrow on account disables override

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0.55, .001); // (0.1 * 2 / 0.4) + (0.1 * 0.25 / 0.5)
            et.equals(r.collateralValue, 3.75, .001); // 10 * 0.5 * 0.75
            et.assert(r.overrideCollateralValue.eq(0));
        }, },

        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { from: ctx.wallet2, send: 'dTokens.dTST3.repay', args: [0, et.MaxUint256], },

        // Override is enabled after repay

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0.2, .001); // 0.1 * 2
            et.equals(r.collateralValue, 4.85, .001); // 10 * 0.5 * 0.97
            et.assert(r.overrideCollateralValue.gt(0));
        }, },
    ],
})



.test({
    desc: "override on non-collateral asset",
    actions: ctx => [
        // set collateral factor to 0
        { action: 'setAssetConfig', tok: 'TST2', config: { collateralFactor: 0, }, },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], expectError: 'e/collateral-violation' },

        // Override is added for this liability/collateral pair

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.97 * 4e9),
            },
        ], },

        // Borrow is possible now

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0.2, .001); // 0.1 * 2
            et.equals(r.collateralValue, 4.85, .001); // 10 * 0.5 * 0.97
            et.assert(r.overrideCollateralValue.gt(0));
        }, },

        // Additional borrow on account is not permitted as it disables override

        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.1)], expectError: 'e/collateral-violation' },

        // Self-collateralisation is permitted

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.001)] },

    ],
})



.test({
    desc: "override self-collateral factor",
    actions: ctx => [
        // set collateral factor to 0

        // { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'eTokens.eTST2.mint', args: [0, et.eth(10)], },


        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) * 1 (BF)
            et.equals(r.collateralValue, 9.5, .001); // 20 * 0.5 (price) * 0.95 (SCF)
            et.equals(r.overrideCollateralValue, 9.5, .001); // whole collateral is in override
        }, },

        // Override is added for the self collateralisation

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST2.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.8 * 4e9),
            },
        ], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) * 1 (BF)
            et.equals(r.collateralValue, 8, .001); // 20 * 0.5 (price) * 0.8 (CF)
            et.equals(r.overrideCollateralValue, 8, .001); // whole collateral is in override
        }, },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST2.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: false,
                collateralFactor:0,
            },
        ], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) * 1 (BF)
            et.equals(r.collateralValue, 9.5, .001); // 20 * 0.5 (price) * 0.95 (SCF)
            et.equals(r.overrideCollateralValue, 9.5, .001); // whole collateral is in override
        }, },
    ],
})




.run();