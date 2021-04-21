const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "liquidation",

    preActions: ctx => {
        let actions = [];

        actions.push({ send: 'tokens.TST.mint', args: [ctx.contracts.liquidationTest.address, et.eth(100)], });
        actions.push({ send: 'liquidationTest.approve', args: [ctx.contracts.euler.address, ctx.contracts.tokens.TST.address], });
        actions.push({ send: 'liquidationTest.enterMarket', args: [ctx.contracts.markets.address, 0, ctx.contracts.tokens.TST.address], });
        actions.push({ send: 'liquidationTest.deposit', args: [ctx.contracts.eTokens.eTST.address, 0, et.eth(100)], });

        actions.push({ send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.2', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.4', });

        return actions;
    },
})



.test({
    desc: "no violation",
    actions: ctx => [
        // User has no borrows or collateral

        { action: 'liquidateForReal', violator: ctx.wallet4, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => 1, expectError: 'e/liq/excessive-repay-amount', },

        // User has no borrows

        { action: 'liquidateForReal', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => 1, expectError: 'e/liq/excessive-repay-amount', },

        // User has sufficient health score

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { action: 'liquidateForReal', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => 1, expectError: 'e/liq/excessive-repay-amount', },
    ],
})




.test({
    desc: "self liquidation",

    actions: ctx => [
        { action: 'liquidateForReal', violator: ctx.contracts.liquidationTest, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => 1, expectError: 'e/liq/self-liquidation', },

        { action: 'liquidateForReal', violator: et.getSubAccount(ctx.contracts.liquidationTest.address, 4), underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => 1, expectError: 'e/liq/self-liquidation', },
    ],
})





.test({
    desc: "basic liquidation",

    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.09, 0.01);
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 0.96, 0.001);
        }, },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 0.96, 0.001);
              et.equals(r.repay, 1.356, 0.001);
              et.equals(r.yield, 8.898, 0.001);
              ctx.stash.repay = r.repay;
          },
        },

        { action: 'liquidateForReal', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => ctx.stash.repay.add(1), expectError: 'e/liq/excessive-repay-amount', },

        { action: 'liquidateForReal', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2, repay: ctx => ctx.stash.repay, },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.2, 0.000001);
        }, },

        { action: 'liquidateDryRun', violator: ctx.wallet2, underlying: ctx.contracts.tokens.TST, collateral: ctx.contracts.tokens.TST2,
          onResult: r => {
              et.equals(r.healthScore, 1.2, 0.000001);
              et.equals(r.repay, 0);
          },
        },
    ],
})



.run();
