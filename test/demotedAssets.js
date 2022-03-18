const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "demoted assets",

    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),
        { from: ctx.wallet3, send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.WETH.address], },
        { from: ctx.wallet3, send: 'tokens.WETH.mint', args: [ctx.wallet3.address, et.eth(100)], },
        { from: ctx.wallet3, send: 'eTokens.eWETH.deposit', args: [0, et.eth(10)], },

        { from: ctx.wallet3, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { from: ctx.wallet3, send: 'tokens.TST3.mint', args: [ctx.wallet3.address, et.eth(100)], },
        { from: ctx.wallet3, send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST3.address, { borrowIsolated: false, });
        }},
    ]
})


.test({
    desc: "collateral demoted to cross tier",
    actions: ctx => [
        // borrow
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },

        // health score ok
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet2.address, ctx.wallet.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address],
            onResult: r => {
                et.equals(r.healthScore, 72.28, 0.01);
                et.equals(r.repay, 0);
                et.equals(r.yield, 0);
            },
        },

        // could borrow more
        { action: 'snapshot', },
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
        { action: 'revert', },

        // collateral demoted to cross tier
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST.address, { collateralFactor: 0, });
        }},

        // try to exit market
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], expectError: 'e/outstanding-borrow' },

        // health score now 0
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet2.address, ctx.wallet.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address],
            onResult: async r => {
                et.equals(r.healthScore, 0);
                const reservesFee = await ctx.contracts.liquidation.UNDERLYING_RESERVES_FEE();
                et.equals(r.repay, et.eth(1).add(reservesFee));

                ctx.stash.repay = r.repay;
            },
        },
        { call: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r.collateralValue, 0);
            et.equals(r.liabilityValue, '0.20750811608329084');
        }, },
        
        // can't borrow more
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], expectError: 'e/collateral-violation', },

        // liquidate full liability
        { from: ctx.wallet2, send: 'liquidation.liquidate', args: [ctx.wallet.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address, () => ctx.stash.repay, 0], },

        // no liabilities left
        { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet2.address, ctx.wallet.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address],
            onResult: r => {
                et.equals(r.repay, 0);
                et.equals(r.yield, 0);
            },
        },
        { call: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r.collateralValue, 0);
            et.equals(r.liabilityValue, 0);
        }, },
        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        // can exit market now
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address], },
    ],
})


.test({
    desc: "cross tier demoted to borrow isolated",
    actions: ctx => [
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },

        // promote to cross tier and borrow other asset
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST2.address, { borrowIsolated: false, });
        }},
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(0.01)], },

        // could borrow more
        { action: 'snapshot', },
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(0.01)], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(0.01)], },
        { action: 'revert', },

        // demote back to borrow isolated
        { action: 'cb', cb: async () => {
            await ctx.setAssetConfig(ctx.contracts.tokens.TST2.address, { borrowIsolated: true, });
        }},

        // can no longer borrow any assets
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], expectError: 'e/borrow-isolation-violation' },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(0.01)], expectError: 'e/borrow-isolation-violation' },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(0.01)], expectError: 'e/borrow-isolation-violation' },

        // unless the isolated borrow is repaid in full
        { send: 'dTokens.dTST2.repay', args: [0, et.eth(1)], },

        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], expectError: 'e/borrow-isolation-violation' },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(0.01)], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(0.01)], },

        // can also exit market
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.WETH.address,], },
    ],
})


.run();
