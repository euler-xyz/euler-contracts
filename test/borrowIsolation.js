const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "borrow isolation",

    preActions: scenarios.basicLiquidity(),
})


.test({
    desc: "borrows are isolated",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        // Entering is OK:
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        // It's the actual borrowing that fails:
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], expectError: 'e/borrow-isolation-violation', },
    ],
})


.test({
    desc: "multiple borrows are possible while in deferred liquidity",
    actions: ctx => [
        { action: 'setOverride', collateral: 'TST2', liability: 'TST2', cf: 0.3 },
        { action: 'setOverride', collateral: 'TST2', liability: 'TST3', cf: 0.3 },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        // second borrow reverts
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
            expectError: 'e/borrow-isolation-violation'
        },

        // unless it's repaid in the same batch
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
        },
        { call: 'dTokens.dTST2.balanceOf', args: [ctx.wallet2.address], equals: 0 },

        // 3rd borrow

        // outstanding borrow
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(100)], },
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST3.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
            expectError: 'e/borrow-isolation-violation',
        },

        // both repaid
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST3.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },
                { send: 'dTokens.dTST3.repay', args: [0, et.MaxUint256], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
        },

        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], equals: 0 },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], equals: 0 },
        { call: 'markets.getBorrowedMarket', args: [ctx.wallet2.address], assertEql: ctx.contracts.tokens.TST.address },

        // both repaid in reverse order
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST3.borrow', args: [0, et.eth('0.00000000001')], },
                { send: 'dTokens.dTST3.repay', args: [0, et.MaxUint256], },
                { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
        },

        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], equals: 0 },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], equals: 0 },
        { call: 'markets.getBorrowedMarket', args: [ctx.wallet2.address], assertEql: ctx.contracts.tokens.TST.address },
    ],
})


.test({
    desc: "getBorrowedMarket reverts with multiple borrows in deferred liquidity check",
    actions: ctx => [
        { action: 'setOverride', collateral: 'TST2', liability: 'TST2', cf: 0.3 },
        { action: 'setOverride', collateral: 'TST2', liability: 'TST3', cf: 0.3 },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        // second borrow reverts
        { 
            action: 'sendBatch',
            from: ctx.wallet2,
            batch: [
                { send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], },
                { call: 'markets.getBorrowedMarket', args: [ctx.wallet2.address], },
            ],
            deferLiquidityChecks: [ctx.wallet2.address],
            expectError: 'e/transient-state'
        },
    ],
})




.run();
