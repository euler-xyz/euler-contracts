const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "liquidation",

    preActions: ctx => {
        let actions = [];

        actions.push({ action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST2', irm: 'IRM_ZERO', });

        actions.push({ send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(200)], });
        actions.push({ send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });
        actions.push({ send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },);

        actions.push({ send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(100)], });
        actions.push({ from: ctx.wallet3, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(30)], });
        actions.push({ send: 'tokens.TST2.mint', args: [ctx.wallet3.address, et.eth(100)], });
        actions.push({ from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, et.eth(18)], });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.2', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.4', });

        return actions;
    },
})



.test({
    desc: "no violation",
    actions: ctx => [
        // User not in underlying:

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/violator-not-entered-underlying', },

        // User healthy:

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/excessive-repay-amount', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], },
    ],
})




.test({
    desc: "self liquidation",

    actions: ctx => [
        { send: 'liquidation.liquidate', args: [ctx.wallet.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/self-liquidation', },

        { send: 'liquidation.liquidate', args: [et.getSubAccount(ctx.wallet.address, 4), ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/self-liquidation', },
    ],
})





.test({
    desc: "basic full liquidation",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.09, 0.01);
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.96, 0.001);
        }, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.96, 0.001);
              et.equals(r.repay, '1.37087512559288065');
              et.equals(r.yield, '8.930102196105970276');
          },
        },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth(2), 0], expectError: 'e/liq/excessive-repay-amount', },

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: 0, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('1.37087512559288065'), 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: et.eth('1.37087512559288065'), },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: '8.930102196105970276', },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('3.642697895452593415'), },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: et.eth('91.069897803894029724'), },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: et.eth('0.013573021045474065'), },

        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('30'), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('18'), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.2, 0.00000001);
        }},
    ],
})




.test({
    desc: "partial liquidation",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('0.5'), 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: et.eth('0.5'), },
        // Proportional: .5/1.37087512559288065 * 8.930102196105970276 = 3.257080834493896689
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: ['3.257080834493', '.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [.005, .001], },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: [4.505, .001], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: [96.743, .001], },

        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('30'), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('18'), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.03, 0.01);
        }},
    ],
})


/*
.test({
    desc: "discount scales with bonus",

    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
        { send: 'liquidationTest.trackAverageLiquidity', args: [ctx.contracts.exec.address, 0], },
        { action: 'jumpTimeAndMine', time: 86400, },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        // Just barely in violation

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.4', },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.99995, 0.00001); // 0.005%
              et.equals(r.discount, 0.0001, 0.00001); // 0.01%
          },
        },

        // Bigger violation: normal users get 2% discount, full bonus users get 8%

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.45', },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              et.equals(r.discount, 0.04, 0.001);
          },
        },

        // Update to account activity resets bonus

        { send: 'liquidationTest.deposit', args: [ctx.contracts.eTokens.eTST.address, 0, et.eth(0.0001)], },
        { action: 'checkpointTime', },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              et.equals(r.discount, 0.02, 0.001);
          },
        },

        // Wait 60 seconds and we should have 1/2 of the bonus

        { action: 'jumpTimeAndMine', time: 60, },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              et.equals(r.discount, 0.03, 0.001);
          },
        },

        // 60 more seconds and we're back to full bonus

        { action: 'jumpTimeAndMine', time: 60, },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.98, 0.001);
              et.equals(r.discount, 0.04, 0.001);
          },
        },

        // Limited by MAXIMUM_BONUS_DISCOUNT

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.6', },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.923, 0.001);
              // Would be 0.077 * 2 = 0.154 without MAXIMUM_BONUS_DISCOUNT
              // But instead, limited to 0.077 + 0.025 = 0.102
              et.equals(r.discount, 0.102, 0.001);
          },
        },

        // Limited by MAXIMUM_DISCOUNT

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '4', },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.6, 0.001);
              et.equals(r.discount, 0.25);
          },
        },
    ],
})
*/



.run();
