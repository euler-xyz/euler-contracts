const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "batch operations",

    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),
        async () => {
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([ctx.contracts.modules.batchTest.address])).wait();
            ctx.contracts.batchTest = await ethers.getContractAt('BatchTest', await ctx.contracts.euler.moduleIdToProxy(et.moduleIds.BATCH_TEST));
        },
    ]
})




.test({
    desc: "sub-account transfers",
    actions: ctx => [
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], assertEql: 0, },

        { call: 'markets.getEnteredMarkets', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: [], },

        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(1)], },
              { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), et.getSubAccount(ctx.wallet.address, 2), et.eth(.6)], },
              { send: 'markets.enterMarket', args: [1, ctx.contracts.tokens.TST.address], },
          ],
        },

        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(.4), },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], assertEql: et.eth(.6), },

        { call: 'markets.getEnteredMarkets', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: [ctx.contracts.tokens.TST.address], },
    ],
})



.test({
    desc: "unknown module",
    actions: ctx => [
        { action: 'sendBatch', batch: [
                { from: ctx.wallet, send: 'flashLoan.onDeferredLiquidityCheck', args: [[]] },
          ], expectError: 'e/batch/unknown-proxy-addr',
        },
    ],
})



.test({
    desc: "internal module",
    actions: ctx => [
        { send: 'batchTest.setModuleId', args: [ctx.contracts.batchTest.address, 1e7], },
        { action: 'sendBatch', batch: [
                { from: ctx.wallet, send: 'batchTest.testCall', args: [] },
          ], expectError: 'e/batch/call-to-internal-module',
        },
    ],
})



.test({
    desc: "module not installed",
    actions: ctx => [
        { send: 'batchTest.setModuleImpl', args: [ctx.contracts.batchTest.address, et.AddressZero], },
        { action: 'sendBatch', batch: [
                { from: ctx.wallet, send: 'batchTest.testCall' },
            ], expectError: 'e/batch/module-not-installed',
        },
    ],
})



.test({
    desc: "reentrancy",
    actions: ctx => [
        { action: 'sendBatch', deferLiquidityChecks: [et.getSubAccount(ctx.wallet.address, 1)], batch: [
            { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(1)], },
            { send: 'exec.batchDispatch',args: [
                [{
                    allowError: false,
                    proxyAddr: ctx.contracts.eTokens.eTST.address,
                    data: ctx.contracts.eTokens.eTST.interface.encodeFunctionData('transfer', [ctx.wallet.address, et.eth(1)])
                }],
                [et.getSubAccount(ctx.wallet.address, 1)],
            ]}
          ], expectError: 'e/batch/reentrancy',
        },
    ],
})



.test({
    desc: "allow error",
    actions: ctx => [
        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(100)], },
              { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(1)], },
          ], expectError: 'e/insufficient-balance',
        }, 
        { action: 'sendBatch', batch: [
              { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(100)], allowError: true, },
              { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(1)], },
          ],
        },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(1), },
    ],
})



.run();
