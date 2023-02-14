const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "asset policies",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "simple supply cap",
    actions: ctx => [
        { call: 'eTokens.eTST.totalSupply', equals: [10, .001], },

        // Deposit prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 11, }, },
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(2)], expectError: 'e/supply-cap-exceeded', },

        // Raise Cap and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 13, }, },
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(2)], },

        // New limit prevents additional deposits:

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(2)], expectError: 'e/supply-cap-exceeded', },

        // Lower supply cap. Withdrawal still works, even though it's not enough withdrawn to solve the policy violation:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 5, }, },
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(3)], },

        { call: 'eTokens.eTST.totalSupply', equals: [9, .001], },

        // Deposit doesn't work

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(.1)], expectError: 'e/supply-cap-exceeded', },
    ],
})


.test({
    desc: "simple borrow cap",
    actions: ctx => [
        { send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        { call: 'dTokens.dTST.totalSupply', equals: [5, .001], },

        // Borrow prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { borrowCap: 6, }, },
        { send: 'dTokens.dTST.borrow', args: [0, et.eth(2)], expectError: 'e/borrow-cap-exceeded', },

        // Raise Cap and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { borrowCap: 8, }, },
        { send: 'dTokens.dTST.borrow', args: [0, et.eth(2)], },

        // New limit prevents additional deposits:

        { send: 'dTokens.dTST.borrow', args: [0, et.eth(2)], expectError: 'e/borrow-cap-exceeded', },

        // Lower borrow cap to the current dToken supply, set IRM to non-zero.
        // Jump time so that new dToken supply exceeds the borrow cap due to the interest accrued

        { action: 'setAssetPolicy', tok: 'TST', policy: { borrowCap: 7, }, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { call: 'dTokens.dTST.totalSupply', equals: [7, .001], },
        
        { action: 'jumpTimeAndMine', time: 2 * 365 * 24 * 60 * 60, },   // 2 years
        { call: 'dTokens.dTST.totalSupply', equals: [8.55, .001], },

        // Repay still works, even though it's not enough repaid to solve the policy violation:

        { send: 'dTokens.dTST.repay', args: [0, et.eth(1)], },

        { call: 'dTokens.dTST.totalSupply', equals: [7.55, .001], },

        // Borrow doesn't work

        { send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], expectError: 'e/borrow-cap-exceeded', },
    ],
})


.test({
    desc: "batch deferral of supply cap check",
    actions: ctx => [
        // Current supply 10, supply cap 15

        { call: 'eTokens.eTST.totalSupply', equals: [10, .001], },
        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 15, }, },

        // This won't work because we don't defer liquidity check:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
          ],
          expectError: 'e/supply-cap-exceeded',
        },

        // This won't work because we aren't entered:

        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        // Deferring doesn't allow us to leave the asset in policy violation:

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        // Being entered into the market allows the policy check to be deferred, so transient violations don't fail:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },

        { call: 'eTokens.eTST.totalSupply', equals: [12, .001], },

        // Same behaviour if we also have a borrow (which causes liquidity check in deposit)

        { from: ctx.wallet, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], expectError: 'e/supply-cap-exceeded', },

        // Failures:

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        // Success

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },
    ],
})


.test({
    desc: "batch deferral of borrow cap check",
    actions: ctx => [
        // Current borrow 0, borrow cap 5

        { call: 'dTokens.dTST2.totalSupply', equals: [0, .001], },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { borrowCap: 5, }, },

        // This won't work because we don't defer liquidity check:

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(6)], },
              { send: 'dTokens.dTST2.repay', args: [0, et.eth(2)], },
          ],
          expectError: 'e/borrow-cap-exceeded',
        },

        // Deferring doesn't allow us to leave the asset in policy violation:

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(6)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/borrow-cap-exceeded',
        },

        // Being entered into the market allows the policy check to be deferred, so transient violations don't fail:

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(6)], },
              { send: 'dTokens.dTST2.repay', args: [0, et.eth(2)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },

        { call: 'dTokens.dTST2.totalSupply', equals: [4, .001], },

        // This works despite the fact we had exited the market because we enter it again on borrow

        { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(6)], },
              { send: 'dTokens.dTST2.repay', args: [0, et.eth(2)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },

        { call: 'dTokens.dTST2.totalSupply', equals: [4, .001], },


        // Failures:

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/borrow-cap-exceeded',
        },

        // Success

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
              { send: 'dTokens.dTST2.repay', args: [0, et.eth(0.1)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },
    ],
})


.test({
    desc: "can't exit market to bypass supply cap checks",
    actions: ctx => [
        // Current supply 10, supply cap 15

        { call: 'eTokens.eTST.totalSupply', equals: [10, .001], },
        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 15, }, },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },

        // Can't exit the market if the asset is in violation at the point of exit:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        // ... but you can if it is not in violation:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(8)], },
              { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
        },
    ],
})


.test({
    desc: "can't exit market to bypass borrow cap checks",
    actions: ctx => [
        // Current borrow 1, borrow cap 5

        { send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { call: 'dTokens.dTST.totalSupply', equals: [1, .001], },
        { action: 'setAssetPolicy', tok: 'TST', policy: { borrowCap: 5, }, },

        // Can't exit the market if the asset is in violation at the point of exit:
        { send: 'markets.enterMarket', args: [1, ctx.contracts.tokens.TST.address], },

        { action: 'sendBatch', batch: [
              { send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
              { send: 'markets.exitMarket', args: [1, ctx.contracts.tokens.TST.address], },
              { send: 'dTokens.dTST.repay', args: [0, et.eth(5)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address, et.getSubAccount(ctx.wallet.address, 1)],
          expectError: 'e/borrow-cap-exceeded',
        },

        // ... but you can if it is not in violation:

        { action: 'sendBatch', batch: [
            { send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
            { send: 'dTokens.dTST.repay', args: [0, et.eth(5)], },
            { send: 'markets.exitMarket', args: [1, ctx.contracts.tokens.TST.address], },
          ],
          deferLiquidityChecks: [ctx.wallet.address, et.getSubAccount(ctx.wallet.address, 1)],
        },
    ],
})

.run();
