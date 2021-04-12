const et = require('./lib/eTestLib');

// TST9 has 6 decimals

et.testSet({
    desc: "tokens with non-18 decimals",

    preActions: ctx => {
        let actions = [];

        actions.push({ action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', });

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST9.mint', args: [from.address, et.units('100', 6)], });
            actions.push({ from, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);
            actions.push({ from, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });

            // approve TST9 token for repay() to avoid ERC20: transfer amount exceeds allowance error
            actions.push({ from, send: 'tokens.TST9.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        actions.push({ action: 'updateUniswapPrice', pair: 'TST9/WETH', price: '.5', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.2', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "basic flow",
    actions: ctx => [
        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(1, 6), },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(1, 6), },

        { send: 'eTokens.eTST9.withdraw', args: [0, et.units(.2, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(.8, 6), },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(.8), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99.2, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.8, 6), },

        { from: ctx.wallet3, send: 'dTokens.dTST9.borrow', args: [0, et.units(.3, 6)], },
        
        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0.300001', 6), },
        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0.3', 27), },

        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units(.3, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.5, 6), },
    

        // Make sure the borrow entered us into the TST9 market as well as the earlier TST2 entered market
        
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet3.address],
          assertEql: [ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST9.address], },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST9.address], assertEql: et.units(1, 27), },

        { action: 'setIRM', underlying: 'TST9', irm: 'IRM_FIXED', },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST9.address], assertEql: et.units('1.000000001189117198929733788', 27), },
        
        // Mint some extra so we can pay interest
        { send: 'tokens.TST9.mint', args: [ctx.wallet3.address, et.units('0.1', 6)], },

        // 1 month later

        { action: 'jumpTime', time: 2628000, }, // 1 month in seconds

        // 1 block later

        { action: 'mineEmptyBlock', },

        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0.302511', 6), },
        
        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0.302510443140194600914321707', 27), },

        // Try to pay off full amount:

        { from: ctx.wallet3, send: 'dTokens.dTST9.repay', args: [0,  et.units('0.302511', 6)], },

        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0', 6), },

        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0', 27), },

        // Check if any more interest is accrued after mined block:
        
        { action: 'mineEmptyBlock' },

        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0', 6), },

        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0', 27), },

        // Use max uint to actually pay off full amount:

        { from: ctx.wallet3, send: 'dTokens.dTST9.repay', args: [0, et.MaxUint256], },

        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units('0', 6), },
        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0', 6), },

        { call: 'dTokens.dTST9.totalSupply', args: [], assertEql: et.units('0', 6), },
        { call: 'dTokens.dTST9.totalSupplyExact', args: [], assertEql: et.units('0', 6), },
    ],
})

.run();
