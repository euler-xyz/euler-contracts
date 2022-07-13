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



.test({
    desc: "should trigger e/borrow-isolation-violation on subsequent borrows when a borrowed asset is borrowIsolated",
    actions: ctx => [
        // Setup TST3 for borrowing
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, borrowFactor: .4}, },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.083', },
        { action: 'jumpTimeAndMine', time: 31*60, },

        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },

        // borrow TST and TST3
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.001)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.001)], },
        
        // check entered markets after borrowing including TST2 market with collateral
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST3.address], },

        // confirm borrowIsolated for borrowed assets
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.borrowIsolated).to.equal(false);
        }},
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST3.address], onResult: r => {
            et.expect(r.borrowIsolated).to.equal(false);
        }},

        // set TST3 borrowIsolated to true
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: true }, },

        // confirm borrowIsolated for borrowed assets
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.borrowIsolated).to.equal(false);
        }},
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST3.address], onResult: r => {
            et.expect(r.borrowIsolated).to.equal(true);
        }},

        // further borrows against TST3 and TST are reverted due to borrow isolation violation
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.00001)],  expectError: 'e/borrow-isolation-violation',},
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.00001)], expectError: 'e/borrow-isolation-violation',},
        
        // debt balance checks
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.001), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.001), },

        // repay debt
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(0.001)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'dTokens.dTST3.repay', args: [0, et.eth(0.001)], },

        // debt balance checks
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.001), },
        
        // borrow TST works
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.001)], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.002), },
    ],
})


.test({
    desc: "should trigger e/borrow-isolation-violation on subsequent borrows when self-collateralised",
    actions: ctx => [
        // self-collateralisation on TST2
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(.001)], },

        // Setup TST3 for borrowing
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, borrowFactor: .4}, },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.083', },
        { action: 'jumpTimeAndMine', time: 31*60, },

        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },

        // further borrows are reverted due to borrow isolation violation 
        // because self-collateralised loans are always isolated
        // and will thus set status.borrowIsolated = true, 
        // i.e., in RiskManager.sol L300
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.00001)], expectError: 'e/borrow-isolation-violation',},
        
        // repay self-collateralisation on TST2
        { from: ctx.wallet2, send: 'dTokens.dTST2.repay', args: [0, et.eth(0.001)], },
        
        // further borrowing works
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.00001)], },
    ],

})


.test({
    desc: "should trigger e/borrow-isolation-violation on attempted self-collateralised loan with existing loan",
    actions: ctx => [
        // Setup TST3 for borrowing
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, borrowFactor: .4}, },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.083', },
        { action: 'jumpTimeAndMine', time: 31*60, },

        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },

        // borrow TST3
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.00001)], },
        
        // attempt self-collateralisation on TST2
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(.001)], expectError: 'e/borrow-isolation-violation', },
        
        // repay existing TST3 loan
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(0.1)], },
        { from: ctx.wallet2, send: 'dTokens.dTST3.repay', args: [0, et.eth(0.00001)], },
        
        // further self borrow now works
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth(.001)], },
    ],

})


.test({
    desc: "adding isolated to non-isolated",
    actions: ctx => [
        // Setup wallet2 with two non-isolated borrows:

        { send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },

        { action: 'setAssetConfig', tok: 'TST', config: { borrowIsolated: false, }, },
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, }, },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.01)], },
        { from: ctx.wallet2, send: 'dTokens.dTST3.borrow', args: [0, et.eth(.01)], },

        // Show that depositing will cause a self-collateralised loan and therefore an isolation violation:

        { from: ctx.wallet2, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], expectError: 'e/borrow-isolation-violation', },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(1)], expectError: 'e/borrow-isolation-violation', },

        // Same with transferring eTokens to this wallet:

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, et.eth(1)], expectError: 'e/borrow-isolation-violation', },
        { send: 'eTokens.eTST3.transfer', args: [ctx.wallet2.address, et.eth(1)], expectError: 'e/borrow-isolation-violation', },
    ],
})


.run();
