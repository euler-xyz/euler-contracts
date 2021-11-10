const et = require('./lib/eTestLib');


et.testSet({
    desc: "liquidation",

    preActions: ctx => {
        let actions = [];

        actions.push({ action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', });
        actions.push({ action: 'setIRM', underlying: 'TST2', irm: 'IRM_ZERO', });
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

        return actions;
    },
})



.test({
    desc: "read parameter constants",
    actions: ctx => [
        { callStatic: 'liquidation.UNDERLYING_RESERVES_FEE', equals: et.units(.02), },
    ],
})



.test({
    desc: "no violation",
    actions: ctx => [
        // User not in underlying:

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/violator-not-entered-underlying', },

        // No liability:

        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/excessive-repay-amount', },

        // User healthy:

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0], expectError: 'e/liq/excessive-repay-amount', },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address, 1, 0], expectError: 'e/liq/violator-not-entered-collateral', },

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
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // If repay amount is 0, it's a no-op
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 0, 0], },

        // Nothing changed:
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.96, 0.001);
              et.equals(r.repay, ctx.stash.repay);
              et.equals(r.yield, ctx.stash.yield);
          },
        },

        // Try to repay too much
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay.add(1), 0], expectError: 'e/liq/excessive-repay-amount', },

        // minYield too low
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, () => ctx.stash.yield.add(1)], expectError: 'e/liq/min-yield', },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: 0, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => ctx.stash.yield, },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => et.units(5).sub(ctx.stash.repay).add(ctx.stash.reserves), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => et.units(100).sub(ctx.stash.yield), },


        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('30'), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('18'), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
            et.equals(r.collateralValue / r.liabilityValue, targetHealth, 0.00000001);
        }},
    ],
})






.test({
    desc: "partial liquidation",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              ctx.stash.origHealth = parseFloat(et.ethers.utils.formatUnits(r.healthScore));
              ctx.stash.repay = r.repay.div(2);
              ctx.stash.yield = ctx.stash.repay.mul(r.yield).div(r.repay);
          },
        },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        // Yield is proportional to how much was repaid
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '.0000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => et.units(5).sub(ctx.stash.repay).add(ctx.stash.reserves), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '.0000000000001'], },

        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('30'), },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: et.eth('18'), },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
            let currHealth = r.collateralValue / r.liabilityValue;
            let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;

            et.expect(currHealth).to.be.greaterThan(ctx.stash.origHealth);
            et.expect(currHealth).to.be.lessThan(targetHealth);
        }},
    ],
})




.test({
    desc: "re-enter violator",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { action: 'sendBatch', batch: [
              { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('0.5'), 0], },
          ],
          deferLiquidityChecks: [ctx.wallet2.address],
          expectError: 'e/liq/violator-liquidity-deferred',
        },
    ],
})


.test({
    desc: "extreme collateral/borrow factors",

    actions: ctx => [
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 1, });
        }},

        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST2.address, { collateralFactor: 0.99, });
        }},

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(18)], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.7', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.repay, '12.04', '.01');
              et.equals(r.yield, 100);
          },
        },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('12.040911423800527111'), 0], },

        // pool takes a loss

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 0, '.00000001');
            et.equals(r.liabilityValue, 16.4, .1);
        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: ['12.04', '.01'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: ['100', '.0000000001'], },
    ],
})





.test({
    desc: "multiple borrows",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'dTokens.dWETH.borrow', args: [0, et.eth(7)], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.3, 0.01);
        }, },

        // collateral decreases in value

        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.3', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.978, 0.001);
              et.equals(r.repay, '1.01');
              et.equals(r.yield, '7.573244326594372653');
          },
        },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.WETH.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 0.978, 0.001);
          },
        },

        // liquidate TST, which is limited to amount owed

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('1.01'), 0], },

        // wasn't sufficient to fully restore health score

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.188, 0.001);
        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: et.eth('1.01'), },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: ['7.573', '.001'], },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], equals: 100, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet2.address], equals: ['7', '.000001'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: ['92.4', '.1']},
    ],
})



.test({
    desc: "multiple collaterals",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(4)], },

        { send: 'tokens.WETH.mint', args: [ctx.wallet2.address, et.eth(200)], },
        { from: ctx.wallet2, send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eWETH.deposit', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.WETH.address], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.39, 0.01);
        }, },

        // borrow increases in value

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '3.15', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.WETH.address],
          onResult: r => {
              et.equals(r.healthScore, 0.976, 0.001);
              et.equals(r.repay, '0.309780544817919039');
              et.equals(r.yield, '1');
          },
        },

        // liquidate TST, which is limited to amount owed

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.WETH.address, et.eth('0.309780544817919039'), 0], },

        // wasn't sufficient to fully restore health score

        { callStatic: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.031, 0.001);
        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: et.eth('0.309780544817919039'), },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], equals: ['101', '.0000000001'], },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: ['3.7', '.1'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: 100},
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet2.address], equals: [0, '.000000000001'], }, // FIXME: dust
    ],
})



.test({
    desc: "aliased underlying and collateral",

    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST2', fee: 0.1, },

        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(30)], },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 1);
          },
        },

        { action: 'checkpointTime', },
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_FIXED', },
        { action: 'jumpTime', time: 86400*300, },
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_ZERO', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.repay, '9.782913679331630293');
          },
        },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        // eTokens:

        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: '0', },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: '100', },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet3.address], equals: '18', },
        { call: 'eTokens.eTST2.reserveBalance', args: [], equals: '0.252051504782480464', },
        { call: 'eTokens.eTST2.totalSupply', args: [], equals: '118.252051504782480464', },

        // Innocent bystander:
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: '18.352819508189524524', },

        // dTokens:

        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet.address], equals: '0', },
        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet2.address], equals: '32.569919874466907063', },
        { call: 'dTokens.dTST2.totalSupply', args: [], equals: '32.569919874466907062', }, // same, but rounded down

        // Do Liquidation:

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST2.address, et.eth('9.782913679331630293'), 0], },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, 1.2, '.00000001');
          },
        },

        // Check eToken changes:

        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: '10.224235378058759156', },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: '89.775764621941240844', }, // 100 - number above
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet3.address], equals: '18', },
        { call: 'eTokens.eTST2.reserveBalance', args: [], equals: '0.347049963511700007', },
        { call: 'eTokens.eTST2.totalSupply', args: [], equals: '118.347049963511700007', }, // increased just by the reserve amount

        // Innocent bystander's underlying amount unchanged:
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: '18.352819508189524524', },

        // dToken changes:

        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet.address], equals: '9.782913679331630293', }, // repay amount
        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet2.address], equals: '22.883866726613807763', }, // orig amount - repay amount + extra
        { call: 'dTokens.dTST2.totalSupply', args: [], equals: '32.666780405945438055', }, // sum of both, rounded up
    ],
})





.test({
    desc: "Minimal collateral factor",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        // collateral factor set to minimum
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST2.address, { collateralFactor: 0.00000000025, });
        }},

        // Can't exit market
        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], expectError: 'e/collateral-violation' },


        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, '0.0000000003', '0.0000000001');
              et.equals(r.repay, '5.049999999030757078');
              et.equals(r.yield, '36.665444706264582147');
          },
        },
        
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, et.eth('5.049999999030757078'), 0], },
        
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              et.equals(r.healthScore, '1.199999998408509922');
              et.equals(r.repay, 0);
              et.equals(r.yield, 0);
          },
        },

        // dust debt remains
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: '0.000000000959646457', },

        // still can't exit market
        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], expectError: 'e/collateral-violation' },

        // collateral factor set to 0
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST2.address, { collateralFactor: 0, });
        }},

        // dust liquidation still possible, unless violator exits market
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                et.equals(r.repay, '0.00000000096924292');
                et.equals(r.yield, '0.000000007037172815');
            },
        },
        
        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            expectError: 'e/liq/violator-not-entered-collateral',
        },
    ],
})


.test({
    desc: "discount scales with booster",
    actions: ctx => [
        { send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(200)], },
        { send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
   
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, false], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.4', },

        // liquidator has no liquidity - base discount
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.01, 0.0001);
            },
        },

        { action: 'snapshot', },

        // liquidator's tracked assets are 20% of violator's liability
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(20)], },
        
        // 50% of liquidity tracking period, 10% supplier booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.011, 0.0001);
            },
        },

        // 100% of liquidity tracking period, 20% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.012, 0.0001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.012, 0.0001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // liquidator's tracked assets are 70% of violator's liability
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(70)], },

        // 50% of liquidity tracking period, 35% supplier booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.0135, 0.0001);
            },
        },

        // 100% of liquidity tracking period, 70% supplier booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.017, 0.0001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.017, 0.0001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // liquidator's tracked assets are 100% of violator's liability
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], },

        // 50% of liquidity tracking period, 50% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.015, 0.0001);
            },
        },

        // 100% of liquidity tracking period, 100% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.02, 0.001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.02, 0.001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // liquidator's tracked assets are 50% of violator's liability
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },

        // 50% of liquidity tracking period, 25% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.0125, 0.0001);
            },
        },

        
        // for the rest of the tracking period liquidator's assets = violator's liability 
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },

        // 100% of liquidity tracking period, 25% /2 + 50% = 65% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.0165, 0.001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // liquidator's tracked assets are 50% of violator's liability for 50% of tracking period
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        // now liquidator withdraws half for 25% of tracking period
        { send: 'eTokens.eTST2.withdraw', args: [0, et.eth(25)], },
        { action: 'jumpTimeAndMine', time: 86400 / 4, },

        // 25% * 0,75 + 6.25% = 25%
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.0125, 0.0001);
            },
        },
        // liquidator withdraws the rest
        { send: 'eTokens.eTST2.withdraw', args: [0, et.eth(25)], },
        { action: 'jumpTimeAndMine', time: 86400 / 4, },

        // 25% * 0.75 + 0 = 18.75%
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.011875, 0.0001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // limited by MAXIMUM_BOOSTER_DISCOUNT
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(200)], },
        { action: 'jumpTimeAndMine', time: 86400, },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.8', },

        // Would be 15.285% * 2, limited to 15.285% + 2.5%
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.85714, 0.00001);
                et.equals(r.discount, 0.17785, 0.000001);
            },
        },

        // limited by MAXIMUM_DISCOUNT
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '4', },

        // Would be 40.99% + 2,5%, limited to 25%
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.6, 0.00001);
                et.equals(r.discount, 0.25, 0.000001);
            },
        },
    ],
})


.test({
    desc: "discount from average liquidity delegation",
    actions: ctx => [
        { send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'tokens.TST2.mint', args: [ctx.wallet4.address, et.eth(100)], },
        { from: ctx.wallet4, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet4, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
   
        { from: ctx.wallet4, send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, false], },
        { from: ctx.wallet4, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },


        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.4', },

        { action: 'jumpTimeAndMine', time: 86400, },
        // no supplier discount
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.01, 0.0001);
            },
        },

        { from: ctx.wallet4, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address, false], },
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet4.address, true], },

        // booster is delegated, but average liquidity was zeroed out
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.01, 0.0001);
            },
        },

        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        // the booster kicks in
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.0125, 0.0001);
            },
        },

        // reaches max
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.015, 0.0001);
            },
        },
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.015, 0.0001);
            },
        },

        // delegation removed, no booster
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, true], },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, 0.01, 0.0001);
            },
        },
    ],
})



.run();
