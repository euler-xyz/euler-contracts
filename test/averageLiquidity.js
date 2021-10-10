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
    desc: "link average liquidity",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('TrackAverageLiquidity');
            et.expect(logs[0].args.account).to.equal(ctx.wallet.address);
        } },
        { from: ctx.wallet2, send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('TrackAverageLiquidity');
            et.expect(logs[0].args.account).to.equal(ctx.wallet2.address);
        }},
    
        { action: 'jumpTimeAndMine', time: 86400, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},

        // declare link
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet2.address], onLogs: logs => et.expect(logs.length).to.equal(0), },

        // zeroes out average liquidity, but doesn't link yet
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0)}},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},

        { action: 'jumpTimeAndMine', time: 86400, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},

        // confirm link
        { from: ctx.wallet2, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('LinkAverageLiquidityTracking');
            et.expect(logs[0].args.accountA).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.accountB).to.equal(ctx.wallet.address);
        } },

        // zeroes out own liquidity, but total now includes the linked account
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 15, 0.002); }},
        
        // total average liquidity is shared
        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15.311, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.311, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 15.311, 0.002); }},

        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15.622, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 15.622, 0.002); }},

        // and it's maxed out
        { action: 'jumpTimeAndMine', time: 86400/2, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15.622, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 15.622, 0.002); }},

        // one account opts out
        { from: ctx.wallet2, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet3.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('UnlinkAverageLiquidityTracking');
            et.expect(logs[0].args.accountA).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.accountB).to.equal(ctx.wallet.address);
        } },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0); }},

        { action: 'jumpTimeAndMine', time: 86400, },

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 15, 0.002); }},
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
        { callStatic: 'exec.getTotalAverageLiquidity', args: [ctx.wallet2.address], onResult: r => { et.equals(r, 0.622, 0.002); }},
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




.run();
