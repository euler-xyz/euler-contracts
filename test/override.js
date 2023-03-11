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

        { from: ctx.wallet2, send: 'eTokens.eTST2.mint', args: [0, et.eth(10)], },


        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) / 1 (BF)
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
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) / 1 (BF)
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
            et.equals(r.liabilityValue, 5, .001); // 10 * 0.5 (price) / 1 (BF)
            et.equals(r.collateralValue, 9.5, .001); // 20 * 0.5 (price) * 0.95 (SCF)
            et.equals(r.overrideCollateralValue, 9.5, .001); // whole collateral is in override
        }, },
    ],
})



.test({
    desc: "self-collateral override doesn't apply with multiple borrows",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST2', config: { borrowIsolated: false, collateralFactor: .7, borrowFactor: .6, }, },

        { from: ctx.wallet2, send: 'eTokens.eTST2.mint', args: [0, et.eth(1)], },


        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, .5, .001); // 1 * 0.5 (price) / 1 (BF)
            et.equals(r.collateralValue, 5.225, .001); // 11 * 0.5 (price) * 0.95 (SCF)
            et.equals(r.overrideCollateralValue, 5.225, .001); // whole collateral is in override
        }, },

        // second borrow
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(2)], },

        // all values counted with regular factors
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 1.833, .001); // 1 * 0.5 (price) / .6 (BF) + 2 * 0.25 (price) / 0.5 (BF)
            et.equals(r.collateralValue, 3.85, .001); // 11 * 0.5 (price) * 0.7 (CF)
            et.equals(r.overrideCollateralValue, 0); // no overrides
        }, },

    ],
})



.test({
    desc: "override getters",
    actions: ctx => [
        { call: 'markets.getOverride', args: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address,], onResult: r => {
            et.expect(r.enabled).to.equal(false);
            et.expect(r.collateralFactor).to.equal(0);
        }},
        { call: 'markets.getOverrideCollaterals', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.length).to.equal(0);
        }},
        { call: 'markets.getOverrideLiabilities', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r.length).to.equal(0);
        }},

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.97 * 4e9),
            },
        ], },

        { call: 'markets.getOverride', args: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address,], onResult: r => {
            et.expect(r.enabled).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0.97 * 4e9);
        }},
        { call: 'markets.getOverrideCollaterals', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.length).to.equal(1);
            et.expect(r[0]).to.equal(ctx.contracts.tokens.TST2.address);
        }},
        { call: 'markets.getOverrideLiabilities', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r.length).to.equal(1);
            et.expect(r[0]).to.equal(ctx.contracts.tokens.TST.address);
        }},

        // no duplicates

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.5 * 4e9),
            },
        ], },

        { call: 'markets.getOverride', args: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address,], onResult: r => {
            et.expect(r.enabled).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0.5 * 4e9);
        }},
        { call: 'markets.getOverrideCollaterals', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.length).to.equal(1);
            et.expect(r[0]).to.equal(ctx.contracts.tokens.TST2.address);
        }},
        { call: 'markets.getOverrideLiabilities', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r.length).to.equal(1);
            et.expect(r[0]).to.equal(ctx.contracts.tokens.TST.address);
        }},

        // disabling removes from array

        // add one more override for TST as liability
        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST3.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },
        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: false,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { call: 'markets.getOverride', args: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address,], onResult: r => {
            et.expect(r.enabled).to.equal(false);
            et.expect(r.collateralFactor).to.equal(0.6 * 4e9);
        }},
        { call: 'markets.getOverrideCollaterals', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.length).to.equal(1);
            et.expect(r[0]).to.equal(ctx.contracts.tokens.TST3.address);
        }},
        { call: 'markets.getOverrideLiabilities', args: [ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r.length).to.equal(0);
        }},
    ],
})



.run();
