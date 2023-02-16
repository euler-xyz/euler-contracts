const et = require('./lib/eTestLib');

const testDetailedLiability = (ctx, expectedHs) => 
    ({ call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
        const [collateral, liabilities] = r.reduce(([c, l], { status }) => [
            status.collateralValue.add(c),
            status.liabilityValue.add(l),
        ], [0, 0])
        et.equals(collateral / liabilities, expectedHs, 0.001);
    }});



et.testSet({
    desc: "liquidation with overrides",

    preActions: ctx => {
        let actions = [];

        actions.push({ action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST2', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', });
        actions.push({ action: 'setAssetConfig', tok: 'WETH', config: { borrowFactor: .4}, });
        actions.push({ action: 'setAssetConfig', tok: 'TST', config: { borrowFactor: .4}, });
        actions.push({ action: 'setAssetConfig', tok: 'TST2', config: { borrowFactor: .4}, });

        // wallet is lender and liquidator

        actions.push({ send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(200)], });
        actions.push({ send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });

        actions.push({ send: 'tokens.WETH.mint', args: [ctx.wallet.address, et.eth(200)], });
        actions.push({ send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ send: 'eTokens.eWETH.deposit', args: [0, et.eth(100)], });

        // wallet2 is borrower/violator

        actions.push({ send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        // wallet3 is innocent bystander

        actions.push({ send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(100)], });
        actions.push({ from: ctx.wallet3, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(30)], });
        actions.push({ send: 'tokens.TST2.mint', args: [ctx.wallet3.address, et.eth(100)], });
        actions.push({ from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, et.eth(18)], });

        // initial prices

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.2', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.4', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '1.7', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST6/WETH', price: '1.3', });

        return actions;
    },
})



.test({
    desc: "I extra regular collateral, result liability fully covered by override",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.12, 0.01);
            et.assert(r.overrideCollateralValue.eq(0));
        }, },
        testDetailedLiability(ctx, 1.121),

        { action: 'snapshot'},

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 3.35, 0.01);
            et.assert(r.overrideCollateralValue.gt(0));
        }, },
        testDetailedLiability(ctx, 3.35),

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.957, 0.001);
        }, },
        testDetailedLiability(ctx, 0.957),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.957, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "II only override collateral",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(4.9)], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.113, 0.001);
            et.assert(r.overrideCollateralValue.eq(0));
        }, },
        testDetailedLiability(ctx, 1.113),

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.982, 0.001);
        }, },
        testDetailedLiability(ctx, 0.982),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.982, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('4.9'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(4.9).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "III extra regular collateral, liquidation doesn't improve health score",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(40)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(7)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.927, 0.001);
        }, },
        testDetailedLiability(ctx, 0.927),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.927, 0.001);
              et.equals(r.yield, 100, 0.00001)
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('7'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(7).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            et.equals(r.collateralValue / r.liabilityValue, 0.8767, 0.0001);
        }},
        testDetailedLiability(ctx, 0.876),
    ],
})





.test({
    desc: "IV extra regular collateral, result liability not fully covered by override",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(20)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5.8)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.994, 0.001);
        }, },
        testDetailedLiability(ctx, 0.994),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.994, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5.8'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5.8).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "V extra regular collateral and override collateral, result liability not fully covered by override",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(8)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(5)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5.8)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.984, 0.001);
        }, },
        testDetailedLiability(ctx, 0.984),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.984, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5.8'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5.8).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "VI extra regular collateral and override collateral, result liability fully covered by override",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(8)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5.8)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.98, 0.001);
        }, },
        testDetailedLiability(ctx, 0.98),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5.8'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5.8).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "VII extra override collateral",
    actions: ctx => [
        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(8.5)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5.8)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.983, 0.001);
        }, },
        testDetailedLiability(ctx, 0.983),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.983, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5.8'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5.8).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "VIII self-collateral, extra regular and override collateral, result fully covered by override collateral",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(2)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.7)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(6.03)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.98, 0.001);
        }, },
        testDetailedLiability(ctx, 0.98),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('6.73'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(6.73).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "IX Secondary calculation is bounded",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(20)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.7)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(7)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.947, 0.001);
        }, },
        testDetailedLiability(ctx, 0.947),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.947, 0.001);
              et.equals(r.yield, 100, 0.000001); // bound on liquidation after secondary repay calculation
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('7.7'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(7.7).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            et.equals(r.collateralValue / r.liabilityValue, 0.97043, 0.00001);
        }},
        testDetailedLiability(ctx, 0.97),
    ],
})





.test({
    desc: "X Liquidate regular collateral, result not fully supported by override collateral",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(200)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.7)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(15.3)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.981, 0.001);
        }, },
        testDetailedLiability(ctx, 0.981),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, 0.981, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('16'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(16).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(200).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "XI Liquidate regular collateral, result fully supported by override collateral",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(20)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.7)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(7.2)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.899, 0.001);
        }, },
        testDetailedLiability(ctx, 0.899),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, 0.899, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('7.9'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(7.9).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(20).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})





.test({
    desc: "XII Primary calculation yields negative repay",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .9}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(15)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(5)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(3.5)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.3 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.949, 0.001);
        }, },
        testDetailedLiability(ctx, 0.949),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.949, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('3.5'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(3.5).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})




.test({
    desc: "XIII Secondary calculation yields negative repay",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(200)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(.7)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(19.3)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.736, 0.001);
        }, },
        testDetailedLiability(ctx, 0.736),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.736, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('20'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(20).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            et.equals(r.collateralValue / r.liabilityValue, 0.6744, 0.0001);
        }},
        testDetailedLiability(ctx, 0.674),
    ],
})




.test({
    desc: "XIV Liquidate self-collateral",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(30)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(50)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.991, 0.001);
        }, },
        testDetailedLiability(ctx, 0.991),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST.address],
          onResult: r => {
              et.equals(r.healthScore, 0.991, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
            },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('55'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield.add(et.eth(100)), '0.00001'], }, // 100 pre-existing depsit

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(55).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(50).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})




.test({
    desc: "XV Liquidate self-collateral with override on self-collateral factor",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: .5}, },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(30)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },


        { send: 'tokens.TST6.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST6.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST6.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST6.address], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST6.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.6 * 4e9),
            },
        ], },

        { from: ctx.wallet2, send: 'eTokens.eTST.mint', args: [0, et.eth(45)], },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST2.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.9 * 4e9),
            },
        ], },


        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '7.4', },

        { send: 'governance.setOverride', args: [
            ctx.contracts.tokens.TST.address,
            ctx.contracts.tokens.TST.address,
            {
                enabled: true,
                collateralFactor: Math.floor(0.8 * 4e9),
            },
        ], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.914, 0.001);
        }, },
        testDetailedLiability(ctx, 0.914),

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST.address],
          onResult: r => {
              et.equals(r.healthScore, 0.914, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
            },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'] },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('45'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield.add(et.eth(100)), '0.00001'], }, // 100 pre-existing depsit

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(45).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(45).sub(ctx.stash.yield), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
        testDetailedLiability(ctx, 1.25),
    ],
})

.run();
