const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');

const PAUSETYPE__DEPOSIT   = 1 << 0
const PAUSETYPE__WITHDRAW  = 1 << 1
const PAUSETYPE__BORROW    = 1 << 2
const PAUSETYPE__REPAY     = 1 << 3
const PAUSETYPE__MINT      = 1 << 4
const PAUSETYPE__BURN      = 1 << 5

et.testSet({
    desc: "asset policies",

    preActions: ctx => {
        let actions = scenarios.basicLiquidity()(ctx)
        actions.push({ send: 'tokens.TST2.mint', args: [ctx.contracts.swapHandlers.mockSwapHandler.address, et.eth(100)], })
        return actions
    }
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
    desc: "supply and borrow cap for mint",
    actions: ctx => [
        { call: 'eTokens.eTST.totalSupply', equals: [10, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [0], },

        // Mint prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 12, borrowCap: 5 }, },
        { send: 'eTokens.eTST.mint', args: [0, et.eth(3)], expectError: 'e/supply-cap-exceeded', },

        // Mint prevented:
        
        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 15, borrowCap: 2 }, },
        { send: 'eTokens.eTST.mint', args: [0, et.eth(3)], expectError: 'e/borrow-cap-exceeded', },

        // Raise caps and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 15, borrowCap: 5 }, },
        { send: 'eTokens.eTST.mint', args: [0, et.eth(3)], },

        // New limit prevents additional mints:

        { send: 'eTokens.eTST.mint', args: [0, et.eth(3)], expectError: 'e/supply-cap-exceeded', },

        // Lower supply cap. Burn still works, even though it's not enough burnt to solve the policy violation:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 1, borrowCap: 1 }, },
        { send: 'eTokens.eTST.burn', args: [0, et.eth(1)], },
        { call: 'eTokens.eTST.totalSupply', equals: [12, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [2, .001], },

        { send: 'eTokens.eTST.burn', args: [0, et.eth(1)], },
        { call: 'eTokens.eTST.totalSupply', equals: [11, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [1, .001], },

        // Deposit doesn't work

        { send: 'eTokens.eTST.mint', args: [0, et.eth(.1)], expectError: 'e/supply-cap-exceeded', },

        // Turn off supply cap. Mint still doesn't work because of borrow cap

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 0, borrowCap: 1 }, },

        { send: 'eTokens.eTST.mint', args: [0, et.eth(.1)], expectError: 'e/borrow-cap-exceeded', },
    ],
})


.test({
    desc: "supply cap for swap hub",
    actions: ctx => [
        // Current supply 10, supply cap 15

        { call: 'eTokens.eTST2.totalSupply', equals: [10, .001], },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { supplyCap: 15, }, },

        // Won't succeed if received tokens would put us over the supply cap

        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: et.eth(1),
                amountOut: et.eth(6),
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], expectError: 'e/supply-cap-exceeded', },

        // Succeeds if received tokens would put us below the supply cap

        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: et.eth(1),
                amountOut: et.eth(5),
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], },

        { call: 'eTokens.eTST2.totalSupply', equals: [15, .001], },
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

        // Deferring doesn't allow us to leave the asset in policy violation:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        // Even though we exited the market, it will get entered by itself, so transient violations don't fail:

        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },

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

        // This works despite the fact we had exited the market because we enter it again when the asset policy is checked

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


.test({
    desc: "simple actions pausing",
    actions: ctx => [
        // Deposit prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__DEPOSIT, }, },
        { send: 'eTokens.eTST.deposit', args: [0, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.deposit', args: [0, 1], },

        // Withdrawal prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { send: 'eTokens.eTST.withdraw', args: [0, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.withdraw', args: [0, 1], },

        // Mint prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__MINT, }, },
        { send: 'eTokens.eTST.mint', args: [0, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.mint', args: [0, 1], },

        // Burn prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__BURN, }, },
        { send: 'eTokens.eTST.burn', args: [0, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.burn', args: [0, 1], },

        // Borrow prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__BORROW, }, },
        { send: 'dTokens.dTST.borrow', args: [0, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'dTokens.dTST.borrow', args: [0, 1], },

        { send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },

        // Repay prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__REPAY, }, },
        { send: 'dTokens.dTST.repay', args: [0, et.MaxUint256], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'dTokens.dTST.repay', args: [0, et.MaxUint256], },

        // eToken transfer prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__DEPOSIT, }, },
        { send: 'eTokens.eTST.transfer', args: [et.AddressZero, 1], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { send: 'eTokens.eTST.transfer', args: [et.AddressZero, 1], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__DEPOSIT | PAUSETYPE__WITHDRAW, }, },
        { send: 'eTokens.eTST.transfer', args: [et.AddressZero, 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.transfer', args: [et.AddressZero, 1], },

        // dToken transfer prevented:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__BORROW, }, },
        { send: 'dTokens.dTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 1], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__REPAY, }, },
        { send: 'dTokens.dTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 1], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__BORROW | PAUSETYPE__REPAY, }, },
        { send: 'dTokens.dTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 1], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 1], },

        // swap prevented:

        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: PAUSETYPE__DEPOSIT, }, },
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: 1,
                amountOut: 1,
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: 0, }, },
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: 1,
                amountOut: 1,
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: PAUSETYPE__DEPOSIT, }, },
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: 1,
                amountOut: 1,
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: 0, }, },
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 0,
                amountIn: 1,
                amountOut: 1,
                exactOutTolerance: 0,
                payload: '0x',
            }
        ], },

        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },

        // swap and repay prevented:

        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: PAUSETYPE__REPAY, }, },
        { send: 'swapHub.swapAndRepay', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 1,
                amountIn: 1,
                amountOut: 0,
                exactOutTolerance: 0,
                payload: '0x',
            },
            0,
        ], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: 0, }, },
        { send: 'swapHub.swapAndRepay', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 1,
                amountIn: 1,
                amountOut: 0,
                exactOutTolerance: 0,
                payload: '0x',
            },
            0,
        ], expectError: 'e/market-operation-paused', },

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: PAUSETYPE__WITHDRAW, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: PAUSETYPE__REPAY, }, },
        { send: 'swapHub.swapAndRepay', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 1,
                amountIn: 1,
                amountOut: 0,
                exactOutTolerance: 0,
                payload: '0x',
            },
            0,
        ], expectError: 'e/market-operation-paused', },

        // Remove pause and it succeeds:

        { action: 'setAssetPolicy', tok: 'TST', policy: { pauseBitmask: 0, }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { pauseBitmask: 0, }, },
        { send: 'swapHub.swapAndRepay', args: [0, 0, ctx.contracts.swapHandlers.mockSwapHandler.address,
            {
                underlyingIn: ctx.contracts.tokens.TST.address,
                underlyingOut: ctx.contracts.tokens.TST2.address,
                mode: 1,
                amountIn: 1,
                amountOut: 0,
                exactOutTolerance: 0,
                payload: '0x',
            },
            0,
        ], },
    ],
})


.test({
    desc: "complex scenario",
    actions: ctx => [
        { call: 'eTokens.eTST.totalSupply', equals: [10, .001], },
        { call: 'eTokens.eTST2.totalSupply', equals: [10, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [0], },
        { call: 'dTokens.dTST2.totalSupply', equals: [0], },

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 15, pauseBitmask: PAUSETYPE__MINT }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { borrowCap: 5, }, },

        // This won't work because the end state violates asset policies:

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.deposit', args: [0, et.eth(7)], },
              { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7)], },

              { send: 'eTokens.eTST.withdraw', args: [0, et.eth(1)], },
              { send: 'dTokens.dTST2.repay', args: [0, et.eth(1)], },
          ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/supply-cap-exceeded',
        },

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eTST.deposit', args: [0, et.eth(7)], },
            { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7)], },
            
            { send: 'eTokens.eTST.withdraw', args: [0, et.eth(3)], },
            { send: 'dTokens.dTST2.repay', args: [0, et.eth(1)], },
        ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/borrow-cap-exceeded',
        },

        // Succeeeds if there's no violation:

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eTST.deposit', args: [0, et.eth(7)], },
            { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7)], },

            { send: 'eTokens.eTST.withdraw', args: [0, et.eth(3)], },
            { send: 'dTokens.dTST2.repay', args: [0, et.eth(3)], },
        ],
          deferLiquidityChecks: [ctx.wallet.address],
        },
        
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(4)], },
        { send: 'dTokens.dTST2.repay', args: [0, et.MaxUint256], },

        // Fails again if mint item added:

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eTST.deposit', args: [0, et.eth(7)], },
            { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7)], },

            { send: 'eTokens.eTST.mint', args: [0, et.eth(1)], },

            { send: 'eTokens.eTST.withdraw', args: [0, et.eth(3)], },
            { send: 'dTokens.dTST2.repay', args: [0, et.eth(4)], },
        ],
          deferLiquidityChecks: [ctx.wallet.address],
          expectError: 'e/market-operation-paused',
        },

        // Succeeds again if mint item added for TST2 instead of TST:

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eTST.deposit', args: [0, et.eth(7)], },
            { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7)], },

            { send: 'eTokens.eTST2.mint', args: [0, et.eth(1)], },

            { send: 'eTokens.eTST.withdraw', args: [0, et.eth(3)], },
            { send: 'dTokens.dTST2.repay', args: [0, et.eth(4)], },
        ],
          deferLiquidityChecks: [ctx.wallet.address],
        },

        // checkpoint:

        { call: 'eTokens.eTST.totalSupply', equals: [14, .001], },
        { call: 'eTokens.eTST2.totalSupply', equals: [11, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [0], },
        { call: 'dTokens.dTST2.totalSupply', equals: [4, .001], },

        // set new asset policies:

        { action: 'setAssetPolicy', tok: 'TST', policy: { supplyCap: 10, borrowCap: 1 }, },
        { action: 'setAssetPolicy', tok: 'TST2', policy: { supplyCap: 1, borrowCap: 1, }, },

        { action: 'sendBatch', batch: [
            // transfer TST2 deposit to sub-account 1. 
            // do not use 'transfer' function to test entering the market in assetPolicyClean.
            // if not entered, it'd fail due to exceeded supply cap
            { send: 'eTokens.eTST2.withdraw', args: [0, et.MaxUint256], },
            { send: 'eTokens.eTST2.deposit', args: [1, et.MaxUint256], },   // this exceeds the supply cap temporarily

            { send: 'dTokens.dTST2.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.MaxUint256], },
            { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },    // this exceeds the supply cap temporarily
            
            { send: 'swapHub.swap', args: [0, 1, ctx.contracts.swapHandlers.mockSwapHandler.address,
                {
                    underlyingIn: ctx.contracts.tokens.TST.address,
                    underlyingOut: ctx.contracts.tokens.TST2.address,
                    mode: 0,
                    amountIn: et.eth(10),   // this should send enough to swap handler not to violate the supply cap any longer
                    amountOut: et.eth(10),  // this exceeds the supply cap temporarily
                    exactOutTolerance: 0,
                    payload: '0x',
                },
            ], },

            // this should burn TST2 debt and deposits, leaving the TST2 borrow cap no longer violated
            { send: 'eTokens.eTST2.burn', args: [1, et.MaxUint256], },

            // this should withdraw TST2 deposits, leaving the TST2 supply cap no longer violated.
            // despite the total supply will be greater than the supply cap, the total supply was reduced hence the transaction succeeds
            { send: 'eTokens.eTST2.withdraw', args: [1, et.MaxUint256], },
        ],
          deferLiquidityChecks: [ctx.wallet.address, et.getSubAccount(ctx.wallet.address, 1)],
        },

        { call: 'eTokens.eTST.totalSupply', equals: [5, .001], },
        { call: 'eTokens.eTST2.totalSupply', equals: [10, .001], },
        { call: 'dTokens.dTST.totalSupply', equals: [0], },
        { call: 'dTokens.dTST2.totalSupply', equals: [0, .001], },
    ],
})

.run();
