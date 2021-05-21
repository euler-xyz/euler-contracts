const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "minting and burning",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "no liquidity",
    actions: ctx => [
        { from: ctx.wallet4, send: 'eTokens.eTST.mint', args: [0, et.eth(1)], expectError: 'e/collateral-violation', },
    ],
})


.test({
    desc: "borrow on empty pool, and repay",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },

        { call: 'eTokens.eTST3.totalSupply', assertEql: 0, },
        { call: 'dTokens.dTST3.totalSupply', assertEql: 0, },

        { from: ctx.wallet, send: 'eTokens.eTST3.mint', args: [0, et.eth(1)], },

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },

        { from: ctx.wallet, send: 'eTokens.eTST3.burn', args: [0, et.eth(1)], },

        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST3.totalSupply', assertEql: 0, },
        { call: 'dTokens.dTST3.totalSupply', assertEql: 0, },

    ],
})



.run();
