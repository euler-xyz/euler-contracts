const et = require('./lib/eTestLib');

et.testSet({
    desc: "defer liquidity check",

    preActions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', },
        { action: 'cb', cb: async () => {
            ctx.contracts.deferredLiquidityCheckTest = await (await ctx.factories.DeferredLiquidityCheckTest.deploy(
                ctx.contracts.euler.address,
                ctx.contracts.markets.address,
                ctx.contracts.exec.address,
            )).deployed();
        }}
    ],
})

.test({
    desc: "simple defer liquidity check",
    actions: ctx => [
        // should revert as liquidity deferred for wrong address
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ et.AddressZero ], 1], 
          expectError: 'e/collateral-violation'
        },

        // should pass as liquidity deferred for correct address
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 1], 
          onLogs: logs => {
            et.expect(logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")).to.gt(-1);
        }},
    ],
})

.test({
    desc: "extended defer liquidity check",
    actions: ctx => [
        // should revert as liquidity deferred only for one address
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0) ], 2], 
          expectError: 'e/collateral-violation'
        },

        // should pass as liquidity deferred for both addresses
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0), et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1) ], 2], 
          onLogs: logs => {
            et.expect(logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")).to.gt(-1);
        }},
    ],
})

.test({
    desc: "defer liquidity check - reentrancies",
    actions: ctx => [
        // should revert due to reentrancy enforced by scenario 3
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 3], 
          expectError: 'e/defer/reentrancy'
        },

        // should revert due to reentrancy enforced by scenario 4
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, 
            [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0), 
              et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1),
              et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 2)  
            ], 4],
          expectError: 'e/defer/reentrancy'
        },

        // should pass as scenario 5 re-enters, but defers liquidity for an address not deferred before
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 5], 
          onLogs: logs => {
            for(const i = 0; i < 4; i++) {
                if (i > 0) {
                    logs.splice(index, 1)
                }
                const index = logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")
                et.expect(index).to.gt(-1);
            }
        }},
    ],
})

.test({
  desc: "batch dispatch from defer liquidity check",
  actions: ctx => [
      // should revert due to reentrancy enforced from defer liquidity check in scenario 6
      { call: 'deferredLiquidityCheckTest.test', 
        args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 6], 
        expectError: 'e/batch/reentrancy'
      },

      // should pass as defer liquidity check defers liquidity for different account than batch dispatch called from defer liquidity check
      { call: 'deferredLiquidityCheckTest.test', 
        args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1) ], 6], 
        onLogs: logs => {
          et.expect(logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")).to.gt(-1);
      }},

      // should revert due to reentrancy enforced from defer liquidity check in scenario 7
      { call: 'deferredLiquidityCheckTest.test', 
        args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0), et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1) ], 7], 
        expectError: 'e/batch/reentrancy'
      },

      // should pass as defer liquidity check defers liquidity for different account than batch dispatch called from defer liquidity check
      { call: 'deferredLiquidityCheckTest.test', 
        args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1), et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 2) ], 7], 
        onLogs: logs => {
          et.expect(logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")).to.gt(-1);
      }},
  ],
})

.test({
    desc: "defer liquidity check from batch dispatch",
    actions: ctx => [
        // should revert due to reentrancy enforced from batch dispatch in scenario 8
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 8], 
          expectError: 'e/defer/reentrancy'
        },

        // should revert due to reentrancy enforced from batch dispatch in scenario 9
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0), et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1) ], 9], 
          expectError: 'e/defer/reentrancy'
        },

        // should revert due to reentrancy enforced from batch dispatch in scenario 10
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 0), et.getSubAccount(ctx.contracts.deferredLiquidityCheckTest.address, 1) ], 10], 
          expectError: 'e/defer/reentrancy'
        },

        // should pass as batch dispatch defers liquidity for different account than defer liquidity check called from batch dispatch
        { call: 'deferredLiquidityCheckTest.test', 
          args: [ctx.contracts.tokens.TST.address, [ ctx.contracts.deferredLiquidityCheckTest.address ], 10], 
          onLogs: logs => {
            et.expect(logs.findIndex(log => log.name === "onDeferredLiquidityCheckEvent")).to.gt(-1);
        }},
    ],
})


.run();
