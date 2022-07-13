const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


let ts = et.testSet({
    desc: "self collateralisation",

    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '1', },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '1', },
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowFactor: .6}, },

        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(50)], }, // extra for the pool

        { send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(100)], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet3.address, et.eth(100)], },

        // User deposits 0.5 TST, which has CF of 0.75, giving a risk-adjusted asset value of 0.375

        { from: ctx.wallet3, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },

    ]
})




.test({
    desc: "self collateralisation",
    actions: ctx => [
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(0.5)], },

        // Now the user tries to mint an amount X of TST3.
        // Since the self-collateralisation factor is 0.95, then X * .95 of this mint is self-collateralised.
        // The remaining 5% is a regular borrow that is adjusted up by the BF of 0.6:
        //     liability = X * (1 - 0.95) / 0.6
        // Using a risk-adjusted value of 0.375, we can solve for the maximum allowable X:
        //     0.375 = X * (1 - 0.95) / 0.6
        //     X = 4.5

        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(4.501)], expectError: 'e/collateral-violation' },
        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(4.5)], expectError: 'e/collateral-violation' },
        // user can only mint 4.5 minus default reserve
        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(4.5).sub(et.BN(et.DefaultReserve))], },
        // deposit a bit more
        { from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.BN(et.DefaultReserve)], },
        // mint subtracted default reserve to makeup 4.5
        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.BN(et.DefaultReserve)], },

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            // Balance adjusted down by SELF_COLLATERAL_FACTOR
            et.equals(r[2].status.collateralValue, 4.275, 0.001); // 4.5 * 0.95
            // Remaining liability is adjusted up by asset borrow factor
            et.equals(r[2].status.liabilityValue, 4.65, 0.001); // 4.275 + ((4.5 - 4.275) / .6)
        }},

        { from: ctx.wallet3, send: 'dTokens.dTST2.borrow', args: [0, et.eth(0.001)], expectError: 'e/borrow-isolation-violation' },


        // Extra balance available as collateral

        { action: 'snapshot', },

        // User deposits an additional 3 TST3 tokens:

        { from: ctx.wallet3, send: 'eTokens.eTST3.deposit', args: [0, et.eth(3)], },

        // This does not effect the user's collateral value because CF == 0:

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r[2].status.collateralValue, 4.5); // Limited to liability because TST3 has 0 collateral factor
            et.equals(r[2].status.liabilityValue, 4.5); // Full liability is now self-collateralised
        }},

        // Now we give TST3 a collateral factor of 0.7:

        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: 0.7, }, },

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            // The liability is fully self-collateralised as before, with 4.5.
            // However, there is also extra collateral available: 7.5 - (4.5/.95)
            // This extra collateral is available for other borrows, after adjusting
            // down according to the asset's collateral factor of 0.7.

            et.equals(r[2].status.collateralValue, '6.434210526315789474', 0.001); // 4.5 + ((7.5 - (4.5/.95)) * .7)
            et.equals(r[2].status.liabilityValue, 4.5); // unchanged
        }},

        { action: 'revert', },


        // Extra liability

        // In this test, the user goes back to having 4.5 units minted, and TST3 has CF == 0
        // The user takes out an additional borrow of TST3, meaning part of the borrow will be
        // self-collateralised, and the remainder will TST3 borrow factor of 0.6 applied.

        { from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], }, // extra collateral so borrow succeeds
        { from: ctx.wallet3, send: 'dTokens.dTST3.borrow', args: [0, et.eth(3)], },

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            // 4.5*.95=4.275 of the liability is self-collateralised. This leaves .225 of the original 4.5
            // mint and 3 of the new borrow as unmet liabilities, which are adjusted up according
            // to the borrow factor of .6.

            et.equals(r[2].status.collateralValue, 4.275, 0.001); // unchanged
            et.equals(r[2].status.liabilityValue, 9.65, 0.001); // 4.275 + ((0.225 + 3) / .6)
        }, },
    ],
})



.test({
    desc: "liquidation, topped-up with other collateral",
    actions: ctx => [
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(0.5).add(et.BN(et.DefaultReserve))], },
        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(4.5)], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r.collateralValue, 4.65, 0.001);
            et.equals(r.liabilityValue, 4.65, 0.001);
        }},

        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_FIXED', },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 86400 * 7, },
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },

        { callStatic: 'exec.liquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r.collateralValue, 4.6505, .0001); // earned a little bit of interest
            et.equals(r.liabilityValue, 4.6640, .0001); // accrued more
        }},

        // Liquidate the self collateral

        { action: 'snapshot', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, 4.6505/4.6640, 0.0001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          }
        },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [0.5, '0.000000001'], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: ['4.5005', '.0001'], },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: ['4.5086', '.0001'], },

        { send: 'liquidation.liquidate', args: [ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address, () => ctx.stash.repay, 0], },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, 2.024, 0.001);
          },
        },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [0.5, '0.000000001'], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [0, '.00000000001'], },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: [.111, .001], },

        { action: 'revert', },


        // Liquidate the other collateral (TST)

        { action: 'snapshot', },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address],
          onResult: r => {
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
          }
        },

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [4.500, .001], },
        { send: 'liquidation.liquidate', args: [ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address, () => ctx.stash.repay, 0], },

        // Health score is exactly 1 because all TST collateral has been consumed, and the remainder is fully self-collateralised

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address],
          onResult: r => {
              et.equals(r.healthScore, 1);
          }
        },

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [0, .000001], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [4.500, .001], },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: [4.020, .001], },

        { action: 'revert', },
    ],
})



.test({
    desc: "liquidation, topped-up with self-collateral",
    actions: ctx => [
        { from: ctx.wallet3, send: 'eTokens.eTST3.deposit', args: [0, et.eth(0.5)], },
        { from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(4.5)], },

        { callStatic: 'exec.liquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r.collateralValue, 4.5);
            et.equals(r.liabilityValue, 4.5);
        }},

        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_FIXED', },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 86400 * 225, },
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },

        { callStatic: 'exec.liquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r.collateralValue, '4.7690', '.0001'); // earned a little bit of interest
            et.equals(r.liabilityValue, '4.7975', '.0001'); // accrued more
        }},

        // Liquidate the self collateral

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, 4.7690/4.7975, .0001);
              ctx.stash.repay = r.repay;
              ctx.stash.yield = r.yield;
        }},

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet3.address], equals: [0], },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: ['5.0200', '.0001'], },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: ['4.7861', '.0001'], },

        { send: 'liquidation.liquidate', args: [ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address, () => ctx.stash.repay, 0], },

        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet.address, ctx.wallet3.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST3.address],
          onResult: r => {
              et.equals(r.healthScore, et.MaxUint256);
        }},

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet3.address], equals: ['0.1064', '.0001'], },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: 0, },
    ],
});



/*
SCF: Self-collateral factor (currently always 0.95)
BF: Borrow factor of self-collateralised asset
OC: Other collateral: Sum of risk-adjusted asset values *not* including self-collateralised asset (converted to ETH)
SA: The self-collateralised asset's *non*-risk adjusted asset value (converted to ETH)
SL: The self-collateralised asset's *non*-risk adjusted liability value (converted to ETH)

returns M: Max self-collateralised amount (subtract min(SA,SL) to get the additional amount that can be minted)

Current leverage: L = (1/(1 - SCF) - 1) * min(SA,SL) / M
*/

function maxSelfCol(SCF, BF, OC, SA, SL) {
    return (OC - Math.max(0, SL - SA)/BF) * BF / (1 - SCF) + Math.max(0, SA - SL) * (1/(1 - SCF) - 1);
}

function testSelfColLimit(otherCol, SA, SL, CF) {
    ts.test({
        desc: `self col limit: OC=${otherCol} / SA=${SA} / SL=${SL} / CF=${CF || 0}`,
        actions: ctx => {
            let actions = [];

            if (!CF) CF = 0;
            if (CF) actions.push({ action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: CF }, });

            if (otherCol !== 0) actions.push({ from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(otherCol)], }); 
            if (SA !== 0) actions.push({ from: ctx.wallet3, send: 'eTokens.eTST3.deposit', args: [0, et.eth(SA)], });
            if (SL !== 0) actions.push({ from: ctx.wallet3, send: 'dTokens.dTST3.borrow', args: [0, et.eth(SL)], });

            let max = maxSelfCol(0.95, 0.6, otherCol * 0.75, SA, SL) - Math.min(SA, SL);

            actions.push({ from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(max + 0.001)], expectError: 'e/collateral-violation', });
            actions.push({ from: ctx.wallet3, send: 'eTokens.eTST3.mint', args: [0, et.eth(max)], });

            return actions;
        },
    });
}

testSelfColLimit(5, 0, 0);
testSelfColLimit(5, 10, 0);
testSelfColLimit(0, 10, 0);
testSelfColLimit(5, 10, 5);
testSelfColLimit(5, 4, 5);
testSelfColLimit(5, 0, 2);

testSelfColLimit(5, 0, 0, .9);
testSelfColLimit(5, 10, 0, .9);
testSelfColLimit(0, 10, 0, .9);
testSelfColLimit(5, 10, 5, .9);
testSelfColLimit(5, 4, 5, .9);
testSelfColLimit(5, 0, 2, .9);


ts.run();
