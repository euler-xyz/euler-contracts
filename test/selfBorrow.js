const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "self borrowing",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "no liquidity",
    actions: ctx => [
        { from: ctx.wallet4, send: 'exec.selfBorrow', args: [ctx.contracts.tokens.TST.address, 0, et.eth(1)], expectError: 'e/collateral-violation', },
    ],
})


.test({
    desc: "borrow on empty pool, and repay",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },

        { call: 'eTokens.eTST3.totalSupply', assertEql: 0, },
        { call: 'dTokens.dTST3.totalSupply', assertEql: 0, },

        { from: ctx.wallet, send: 'exec.selfBorrow', args: [ctx.contracts.tokens.TST3.address, 0, et.eth(1)], },

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },

        { from: ctx.wallet, send: 'exec.selfRepay', args: [ctx.contracts.tokens.TST3.address, 0, et.eth(1)], },

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST3.totalSupply', assertEql: 0, },
        { call: 'dTokens.dTST3.totalSupply', assertEql: 0, },

    ],
})



.run();
