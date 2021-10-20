const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "average liquidity",

    preActions: scenarios.basicLiquidity(),
})




.test({
    desc: "average liquidity progression",
    actions: ctx => [
        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '2', }, // make it same as TST

        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], onResult: r => { et.equals(r, 0); }},

        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, false], },

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

        { from: ctx.wallet, send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },
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
        { send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, false], },

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
    desc: "average liquidity delegation - set / disable",
    actions: ctx => [
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },


        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet2.address, false], onLogs: logs => {
            et.expect(logs.length).to.equal(2);
            et.expect(logs[0].name).to.equal('DelegateAverageLiquidity');
            et.expect(logs[0].args.account).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.delegate).to.equal(ctx.wallet2.address);
        }},

        { action: 'jumpTimeAndMine', time: 84600 * 2 },

        // no effect yet
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [15, .001], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [0], },


        // reciproval delegation, skip tracking
        { from: ctx.wallet2, send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address, true], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('DelegateAverageLiquidity');
        }},
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(ctx.wallet2.address);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [0], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(ctx.wallet.address);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [15, .001], },

        { action: 'snapshot', },

        // delegation disabled on wallet1
        { from: ctx.wallet, send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, true], },
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [15, .001], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [0], },

        { action: 'revert', },
        { action: 'snapshot', },

        // delegation disabled on wallet2
        { from: ctx.wallet, send: 'exec.trackAverageLiquidity', args: [0, et.AddressZero, true], },
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [15, .001], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [0], },

        { action: 'revert', },
        { action: 'snapshot', },

        // untrack average liquidity on wallet1
        { from: ctx.wallet, send: 'exec.unTrackAverageLiquidity', args: [0], },
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [0], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [0], },

        { action: 'revert', },
        { action: 'snapshot', },

        // untrack average liquidity on wallet2
        { from: ctx.wallet2, send: 'exec.unTrackAverageLiquidity', args: [0], },
        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet.address], equals: [15, .001], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet.address], equals: [15, .001], },

        { call: 'exec.getAverageLiquidityDelegateAccount', args: [ctx.wallet2.address], onResult: r => {
            et.expect(r).to.equal(et.AddressZero);
        }, },
        { callStatic: 'exec.getAverageLiquidity', args: [ctx.wallet2.address], equals: [0], },
        { callStatic: 'exec.getAverageLiquidityWithDelegate', args: [ctx.wallet2.address], equals: [0], },

    ],
})




.test({
    desc: "delegate average liquidity - self delegation",
    actions: ctx => [
        { send: 'exec.trackAverageLiquidity', args: [0, ctx.wallet.address, false], expectError: 'e/track-liquidity/self-delegation', },
    ],
})




.run();
