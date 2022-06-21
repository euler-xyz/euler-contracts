const et = require('./lib/eTestLib');

const getRepayPreFees = async (ctx, amount) => {
    const reserveFee = await ctx.contracts.liquidation.UNDERLYING_RESERVES_FEE()
    return amount.mul(et.eth(1)).mul(et.eth(1)).div(et.eth(1).add(reserveFee)).div(et.eth(1))
}
const getRiskAdjustedValue = (amount, price, factor) => amount.mul(et.eth(price)).div(et.eth(1)).mul(et.eth(factor)).div(et.eth(1))

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

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.09, 0.01);
        }, },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
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

        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('30'), 0.01], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('18'), 0.01], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
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
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },

        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('30'), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('18'), '0.000000000001'], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
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

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
          onResult: r => {
              ctx.stash.repay = r.repay;
          },
        },
        { action: 'sendBatch', batch: [
              { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },
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
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
          },
        },

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // pool takes a loss

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async r => {
            const repayPreFees = await getRepayPreFees(ctx, ctx.stash.repay);
            const liabilityValue = getRiskAdjustedValue(et.eth(18).sub(repayPreFees), 2.7, 1);

            et.equals(r.collateralValue, 0, '.00000001');
            et.equals(r.liabilityValue, liabilityValue, '0.01');

        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => [ctx.stash.repay, '.01'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: ['100', '.0000000001'], },
    ],
})





.test({
    desc: "multiple borrows",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'dTokens.dWETH.borrow', args: [0, et.eth(7)], },

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.3, 0.01);
        }, },

        // collateral decreases in value

        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.3', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.978, 0.001);
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
            },
        },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.WETH.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.978, 0.001);
            },
        },

        // liquidate TST, which is limited to amount owed

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },

        // wasn't sufficient to fully restore health score

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async r => {
            const repayPreFees = await getRepayPreFees(ctx, ctx.stash.repay);

            const liabilityValueTST = getRiskAdjustedValue(et.eth(1).sub(repayPreFees), 2.2, 1 / 0.4);
            const liabilityValueWETH = getRiskAdjustedValue(et.eth(7), 1, 1 / 0.4);
            const totalLV = liabilityValueTST.add(liabilityValueWETH);

            const collateralValueTST2 = getRiskAdjustedValue(et.eth(100).sub(ctx.stash.yield), .3, .75);

            et.equals(r.collateralValue / r.liabilityValue, collateralValueTST2 / totalLV, 0.001);
        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '.001'], },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], equals: 100, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet2.address], equals: ['7', '.000001'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: () => [et.eth(100).sub(ctx.stash.yield), '.1']},
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

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.39, 0.01);
        }, },

        // borrow increases in value

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '3.15', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.WETH.address],
          onResult: r => {
              et.equals(r.healthScore, 0.976, 0.001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // liquidate TST, which is limited to amount owed

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.WETH.address, () => ctx.stash.repay, 0], },

        // wasn't sufficient to fully restore health score

        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async r => {
            const repayPreFees = await getRepayPreFees(ctx, ctx.stash.repay);
            const liabilityValue = getRiskAdjustedValue(et.eth(4).sub(repayPreFees), 3.15, 1 / 0.4);

            const collateralValueTST2 = getRiskAdjustedValue(et.eth(100), .4, .75);
            const collateralValueWETH= getRiskAdjustedValue(et.eth(1).sub(ctx.stash.yield), .4, .75);
            et.equals(r.collateralValue / r.liabilityValue, collateralValueTST2.add(collateralValueWETH) / liabilityValue, 0.001);
        }},

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], equals: () => [et.eth(100).add(ctx.stash.yield), '.0000000001'], },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.eth(4).sub(ctx.stash.repay), '.1'], },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: 100},
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet2.address], equals: [0, '.000000000001'], }, // FIXME: dust
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
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
            },
        },
        
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },
        
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: async r => {
                const repayPreFees = await getRepayPreFees(ctx, ctx.stash.repay);
                const liabilityValue = getRiskAdjustedValue(et.eth(5).sub(repayPreFees), 2.2, 1 / 0.4);
                const collateralValue = getRiskAdjustedValue(et.eth(100).sub(ctx.stash.yield), .4, '0.00000000025');

                et.equals(r.healthScore, collateralValue / liabilityValue, '0.0001');
                et.equals(r.repay, 0);
                et.equals(r.yield, 0);
            },
        },

        // dust debt remains
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], onResult: r => {
            et.assert(r.gt(0))
            et.assert(r.lte(et.eth('0.000000001')))
        }, },

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

                et.assert(r.repay.gt(0));
                et.assert(r.repay.lte(et.eth('0.00000001')));
                et.assert(r.yield.gt(0));
                et.assert(r.yield.lte(et.eth('0.00000001')));
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
            onResult: async r => {
                ctx.stash.reservesFee = await ctx.contracts.liquidation.UNDERLYING_RESERVES_FEE();
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee, 0.0001);
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
                et.equals(r.discount, ctx.stash.reservesFee.mul(11).div(10), 0.0001);
            },
        },

        // 100% of liquidity tracking period, 20% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(12).div(10), 0.0001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(120).div(100), 0.0001);
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
                et.equals(r.discount, ctx.stash.reservesFee.mul(135).div(100), 0.0001);
            },
        },

        // 100% of liquidity tracking period, 70% supplier booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(170).div(100), 0.0001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount,  ctx.stash.reservesFee.mul(170).div(100), 0.0001);
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
                et.equals(r.discount, ctx.stash.reservesFee.mul(150).div(100), 0.0001);
            },
        },

        // 100% of liquidity tracking period, 100% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(2), 0.001);
            },
        },

        // 110% of liquidity tracking period - booster maxed out
        { action: 'jumpTimeAndMine', time: 86400 / 10, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(2), 0.001);
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
                et.equals(r.discount, ctx.stash.reservesFee.mul(125).div(100), 0.0001);
            },
        },

        
        // for the rest of the tracking period liquidator's assets = violator's liability 
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },

        // 100% of liquidity tracking period, 25% /2 + 50% = 65% booster
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(165).div(100), 0.001);
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
                et.equals(r.discount, ctx.stash.reservesFee.mul(125).div(100), 0.0001);
            },
        },
        // liquidator withdraws the rest
        // minus initial reserve and 1 wei less due to rounding 
        { send: 'eTokens.eTST2.withdraw', args: [0, et.eth(25)], expectError: 'e/insufficient-balance', },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => et.eth(25).sub(2), },
        // instead of expected max amount of 25, request a withdrawal of max
        { send: 'eTokens.eTST2.withdraw', args: [0, et.MaxUint256], },
        // check balance is zero after withdrawing max
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => 0, },

        { action: 'jumpTimeAndMine', time: 86400 / 4, },

        // 25% * 0.75 + 0 = 18.75%
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(11875).div(10000), 0.0001);
            },
        },

        { action: 'revert', },
        { action: 'snapshot', },

        // limited by MAXIMUM_BOOSTER_DISCOUNT
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(200)], },
        { action: 'jumpTimeAndMine', time: 86400, },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.8', },

        // Would be 15.285% * 2, limited to 15.285% + MAXIMUM_BOOSTER_DISCOUNT
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: async r => {
                et.equals(r.healthScore, 0.85714, 0.00001);
                
                const maxBoosterDiscount = await ctx.contracts.liquidation.MAXIMUM_BOOSTER_DISCOUNT();
                et.equals(r.discount, ctx.stash.reservesFee.add(et.eth(1)).sub(r.healthScore).add(maxBoosterDiscount), 0.000001);
            },
        },

        // limited by MAXIMUM_DISCOUNT
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '4', },

        // Would be 40.99% + 2,5%, limited to MAXIMUM_DISCOUNT
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: async r => {
                et.equals(r.healthScore, 0.6, 0.00001);
                const maxDiscount = await ctx.contracts.liquidation.MAXIMUM_DISCOUNT();
                et.equals(r.discount, maxDiscount, 0.000001);
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
            onResult: async r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                ctx.stash.reservesFee = await ctx.contracts.liquidation.UNDERLYING_RESERVES_FEE();
                et.equals(r.discount, ctx.stash.reservesFee, 0.0001);
            },
        },

        { from: ctx.wallet4, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address, false], },
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet4.address, true], },

        // booster is delegated, but average liquidity was zeroed out
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee, 0.0001);
            },
        },

        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        // the booster kicks in
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(125).div(100), 0.0001);
            },
        },

        // reaches max
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(150).div(100), 0.0001);
            },
        },
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee.mul(150).div(100), 0.0001);
            },
        },

        // delegation removed, no booster
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, true], },
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0.99995, 0.00001);
                et.equals(r.discount, ctx.stash.reservesFee, 0.0001);
            },
        },
    ],
})




// wallet4 will be violator, using TST9 (6 decimals) as collateral

.test({
    desc: "non-18 decimal collateral",

    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST9', config: { collateralFactor: .7, }, },

        { action: 'updateUniswapPrice', pair: 'TST9/WETH', price: '17', },
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST9.address], },

        { send: 'tokens.TST9.mint', args: [ctx.wallet4.address, et.units(100, 6)], },
        { from: ctx.wallet4, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet4, send: 'eTokens.eTST9.deposit', args: [0, et.units(10, 6)], },
        { from: ctx.wallet4, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST9.address], },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(20)], },

        { call: 'exec.liquidity', args: [ctx.wallet4.address], onResult: r => {
            et.equals(r.collateralValue / r.liabilityValue, 1.08, 0.01);
        }, },

        { action: 'updateUniswapPrice', pair: 'TST9/WETH', price: '15.5', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet4.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST9.address],
          onResult: r => {
              et.equals(r.healthScore, 0.986, 0.001);
              et.equals(r.repay, et.eth('5.600403626769637232'), '0.0000000001');
              et.equals(r.yield, et.eth('0.806407532618212039'), '0.000000000001');

              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          },
        },

        // Successful liquidation

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: et.eth('20'), },

        { send: 'liquidation.liquidate', args: [ctx.wallet4.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST9.address, () => ctx.stash.repay, 0], },

        // liquidator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: () => ctx.stash.repay, },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => ctx.stash.yield.div(1e12), }, // converted to 6 decimals

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: () => [et.units(20).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet4.address], equals: () => [et.units(10, 6).sub(ctx.stash.yield.div(1e12)), 1e-6], },
    ],
})


.test({
    desc: "zero borrow factor with basic full liquidation",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        {
            call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
                et.equals(r.collateralValue / r.liabilityValue, 1.09, 0.01);
            },
        },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2.5', },

        {
            call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
                et.equals(r.collateralValue / r.liabilityValue, 0.96, 0.001);
            },
        },

        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
            },
        },

        // If repay amount is 0, it's a no-op
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 0, 0], },

        // Nothing changed:
        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                et.equals(r.repay, ctx.stash.repay);
                et.equals(r.yield, ctx.stash.yield);
            },
        },

        // Try to repay too much
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay.add(1), 0], expectError: 'e/liq/excessive-repay-amount', },

        // minYield too low
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, () => ctx.stash.yield.add(1)], expectError: 'e/liq/min-yield', },

        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: [0, '0.000000000001'], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth('5'), },

        // Liquidation on asset with zero borrow factor without defer liquidity checks (for liquidator) reverts
        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], expectError: 'e/collateral-violation' },

        // Successful liquidation on asset with zero borrow factor with deferred liquidity checks
        {
            action: 'sendBatch', batch: [
                { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, () => ctx.stash.repay, 0], },
                { from: ctx.wallet, send: 'dTokens.dTST.repay', args: [0, ctx.stash.repay], },
            ],
            deferLiquidityChecks: [ctx.wallet.address],
        },

        // liquidator:
        // debt is repaid in batch transaction above
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: [0], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: () => [ctx.stash.yield, '0.000000000001'], },

        // reserves:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', onResult: (r) => ctx.stash.reserves = r, },

        // violator:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: () => [et.units(5).sub(ctx.stash.repay).add(ctx.stash.reserves), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet2.address], equals: () => [et.units(100).sub(ctx.stash.yield), '0.000000000001'], },


        // Confirming innocent bystander's balance not changed:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('30'), '0.000000000001'], },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [et.eth('18'), '0.000000000001'], },

        {
            call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: async (r) => {
                let targetHealth = (await ctx.contracts.liquidation.TARGET_HEALTH()) / 1e18;
                et.equals(r.collateralFactor / r.liabilityValue, targetHealth, 1e-24);
            }
        },
    ],
})

 
.test({
    desc: "zero borrow factor does not permit any borrowing",

    actions: ctx => [
        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], 
            expectError: 'e/liq/violator-not-entered-underlying',
        },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], expectError: 'e/collateral-violation' },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },

        // no change in liquidation opportunity or healthScore
        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            expectError: 'e/liq/violator-not-entered-underlying',
        },
    ],
})


.test({
    desc: "zero borrow factor allows deposit",

    actions: ctx => [
        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },
        
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: 0, },

        // deposit more TST tokens for eTST
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(5)], },
        { from: ctx.wallet2, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(5)], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: [et.eth(5), '0.000000000001'], },

        // repay without liability is a no-op
        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth(5)], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: [et.eth(5), '0.000000000001'], },
    ],
})



.test({
    desc: "zero borrow factor puts user with existing liability in violation, with zero healthScore and prevents further borrowing",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], expectError: 'e/collateral-violation' },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
            },
        },
    ],
})


.test({
    desc: "zero borrow factor permits deposit, but no further borrowing with existing liability",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], expectError: 'e/collateral-violation' },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
            },
        },

        // deposit more TST2
        { send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        // no change in liquidation opportunity or healthScore after deposit
        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                et.equals(r.repay, ctx.stash.repay);
                et.equals(r.yield, ctx.stash.yield);
            },
        },
    ],
})


.test({
    desc: "zero borrow factor permits repay, but no further borrowing with existing liability",

    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            action: 'cb', cb: async () => {
                await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { borrowFactor: 0, });
            }
        },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                ctx.stash.repay = r.repay;
                ctx.stash.yield = r.yield;
            },
        },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], expectError: 'e/collateral-violation' },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },

        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.equals(r.healthScore, 0);
                et.equals(r.repay, ctx.stash.repay);
                et.equals(r.yield, ctx.stash.yield);
            },
        },

        // repay dTST with TST tokens
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(5), },
        { from: ctx.wallet2, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },

        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: et.eth(100), },

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth(5)], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(0), },
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: et.eth(100), },
        
        // no liquidation opportunity i.e., yield or repay after dToken repay
        {
            callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            onResult: r => {
                et.expect(parseInt(r.healthScore)).to.be.greaterThan(0);
                et.equals(r.repay, 0);
                et.equals(r.yield, 0);
            },
        },
    ],
})


.run();
