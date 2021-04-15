const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "borrow isolation",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "adding isolated to non-isolated",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        // Entering is OK:
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        // It's the actual borrowing that fails:
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], expectError: 'e/borrow-isolation-violation', },
    ],
})



.test({
    desc: "adding non-isolated to isolated",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(.1)], },

        // Entering is OK:
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        // It's the actual borrowing that fails:
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth('0.00000000001')], expectError: 'e/borrow-isolation-violation', },
    ],
})



.test({
    desc: "adding isolated to isolated",
    actions: ctx => [
        // Setup TST3 for borrowing

        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },


        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(.1)], },

        // Entering is OK:
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        // It's the actual borrowing that fails:
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth('0.00000000001')], expectError: 'e/borrow-isolation-violation', },
    ],
})



.test({
    desc: "adding non-isolated to non-isolated",
    actions: ctx => [
        // Setup WETH for borrowing
        { send: 'tokens.WETH.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.WETH.address], },
        { send: 'tokens.WETH.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eWETH.deposit', args: [0, et.eth(10)], },


        { from: ctx.wallet2, send: 'dTokens.dWETH.borrow', args: [0, et.eth(.1)], },

        // Borrow is actually OK here:
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.001)], },
    ],
})


.run();
