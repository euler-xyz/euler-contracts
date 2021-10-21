const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "average liquidity",

    preActions: scenarios.basicLiquidity(),
})

// 

.test({
    desc: "average liquidity progression",
    actions: ctx => [
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},

        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},

        // Half way:

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 7.5, 0.002); }},

        // When fully averaged, liquidity should be 10 * 2 * .75 = 15

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},

        // Stablised

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},

        // Deposit some more

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        // Liquidity is unchanged so far:

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},

        // But jumps half way to new level:

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 22.5, 0.003); }},

        // New full level:

        { action: 'jumpTimeAndMine', time: 86400, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 30, 0.003); }},

        // Now do a borrow, to reduce liquidity. No update right away:

        { from: ctx.wallet, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 30, 0.003); }},

        // Half way:

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 17.5, 0.002); }},

        // All the way:

        { action: 'jumpTimeAndMine', time: 86400/2, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 5, 0.002); }},

        // Stop tracking

        { send: 'exec.unTrackAverageLiquidity', args: [0], },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: 0, },
    ],
})




.test({
    desc: "batch borrow",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},

        { action: 'snapshot' },

        { send: 'dTokens.dTST.borrow', args: [0, et.eth(2)], },

        { action: 'jumpTimeAndMine', time: 86400, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { 
            ctx.stash.a = r;
        }},

        { action: 'revert' },

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
              { send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
          ],
        },
        { action: 'jumpTimeAndMine', time: 86400, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r, ctx.stash.a);
        }},
    ],
})




.test({
    desc: "friend",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet3.address], },
        { from: ctx.wallet3, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address], },
        { action: 'jumpTimeAndMine', time: 2 * 86400, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001]},
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet3.address, et.eth(5)], },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001]},
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},

        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},
        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},
        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},
        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [7.5, .001]},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet3.address], equals: [7.5, .001]},
    ],
})




.test({
    desc: "no friend, withdraw",
    actions: ctx => [
        // single account holds all the assets
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], },
        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(5)], },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},

        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},
    ],
})



.test({
    desc: "friend, withdraw",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet3.address], },
        { from: ctx.wallet3, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address], },
        // assets split 50/50
        { send: 'eTokens.eTST.transfer', args: [ctx.wallet3.address, et.eth(5)], },

        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(5)], },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},

        { action: 'jumpTimeAndMine', time: 86400/4, },

        // diverging result Error: equals failure: 8.437436229359898321 was not 7.5 +/- 0.001
        // ~12% bonus
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [7.5, .001]},
    ],
})


.test({
    desc: "no friend, withdraw, 100 deposit",
    actions: ctx => [
        // single account holds all the assets
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(90)], },
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], },
        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [75, .1]},

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(5)], },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [75, .1]},

        { action: 'jumpTimeAndMine', time: 86400/4, },
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [91, 1]},
    ],
})



.test({
    desc: "friend, withdraw, 100 deposit",
    actions: ctx => [
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(90)], },

        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet3.address], },
        { from: ctx.wallet3, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address], },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet3.address, et.eth(95)], },

        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [75, .1]},

        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(5)], },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [75, .1]},

        { action: 'jumpTimeAndMine', time: 86400/4, },

        // diverging result Error: equals failure: 109.684045095069168181 was not 91.0 +/- 1.0
        // ~20 % bonus
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [91, 1]},
    ],
})




.test({
    desc: "sampling",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], },
        
        { action: 'snapshot' },

        // no updates over the whole tracking period
        { action: 'jumpTimeAndMine', time: 86400, },

        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},

        { action: 'revert' },
        // withdraw 1 wei half way through the tracking period (update avg liquidity)
        { action: 'jumpTimeAndMine', time: 86400 / 2, },
        { send: 'eTokens.eTST.withdraw', args: [0, 1], },
        { action: 'jumpTimeAndMine', time: 86400 / 2, },

        // Error: equals failure: 11.250204323558503055 was not 15.0 +/- 0.001
        // (15 / 2) / 2 + 15 / 2 = 11.25
        { callStatic: 'exec.getAverageLiquidityWithFriend', args: [ctx.wallet.address], equals: [15, .001]},

    ],
})


.run();
