const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "average liquidity",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "average liquidity progression",
    actions: ctx => [
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},

        { send: 'exec.trackAverageLiquidity', args: [0], },

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
        { send: 'exec.trackAverageLiquidity', args: [0], },

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




.run();
