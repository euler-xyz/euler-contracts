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
        { action: 'setIRM', underlying: 'TST9', irm: 'IRM_LINEAR', },

        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(1, 6), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(1, 6), },

        { send: 'eTokens.eTST9.withdraw', args: [0, et.units(.2, 6)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(.8, 6), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], equals: [et.eth(.8), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet.address], assertEql: et.units(99.2, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.8, 6), },

        { from: ctx.wallet3, send: 'dTokens.dTST9.borrow', args: [0, et.units(.3, 6)], },
        
        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units(.3, 6), },
        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0.3', 27), },
        { call: 'dTokens.dTST9.totalSupply', args: [], assertEql: et.units(.3, 6), },

        { call: 'tokens.TST9.balanceOf', args: [ctx.wallet3.address], assertEql: et.units(.3, 6), },
        { call: 'tokens.TST9.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(.5, 6), },
    

        // Make sure the borrow entered us into the TST9 market as well as the earlier TST2 entered market
        
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet3.address],
          assertEql: [ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST9.address], },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST9.address], assertEql: et.units(1, 27), },

        { action: 'setIRM', underlying: 'TST9', irm: 'IRM_FIXED', },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST9.address], assertEql: et.units('1.000000001188327693544296824', 27), },
        
        // Mint some extra so we can pay interest
        { send: 'tokens.TST9.mint', args: [ctx.wallet3.address, et.units('0.1', 6)], },

        // 1 month later

        { action: 'jumpTime', time: 2628000, }, // 1 month in seconds

        // 1 block later

        { action: 'mineEmptyBlock', },

        { call: 'dTokens.dTST9.balanceOfExact', args: [ctx.wallet3.address], assertEql: et.units('0.302510442180701447843926881', 27), },
        // Rounds up to 6th decimal place:
        { call: 'dTokens.dTST9.balanceOf', args: [ctx.wallet3.address],      assertEql: et.units('0.302511', 6), },
        // Does not round up:
        { call: 'dTokens.dTST9.totalSupply', args: [],                       assertEql: et.units('0.302510', 6), },

        // Conversion methods
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], equals: [et.eth('0.8'), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST9.balanceOfUnderlying', args: [ctx.wallet.address], equals: et.units('0.801933', 6), },
        { call: 'eTokens.eTST9.convertBalanceToUnderlying', args: [et.eth('0.8')], equals: et.units('0.801933', 6), },
        { call: 'eTokens.eTST9.convertBalanceToUnderlying', args: [et.eth('0.8').mul(1000)], equals: [et.units('0.801933', 6).mul(1000), et.units('0.0001', 6)], },
        { call: 'eTokens.eTST9.convertUnderlyingToBalance', args: [et.units('0.801933', 6)], equals: [et.eth('0.8'), '.000001'], },

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


.test({
    desc: "decimals() on e tokens should always return 18 when underlying decimals < 18",

    actions: ctx => [
        {call: 'tokens.TST9.decimals', args: [], equals: [6] },
        {call: 'eTokens.eTST9.decimals', args: [], equals: [18] },
    ],
})


.test({
    desc: "decimals() on e tokens should always return 18 when underlying decimals is 0",

    actions: ctx => [
        // TST10 has 0 decimals
        { send: 'tokens.TST10.mint', args: [ctx.wallet.address, 100], },
        { send: 'tokens.TST10.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST10.address], },
        { send: 'eTokens.eTST10.deposit', args: [0, 50] },

        {call: 'tokens.TST10.decimals', args: [], equals: [0] },
        {call: 'eTokens.eTST10.decimals', args: [], equals: [18] },
    ],
})


.test({
    desc: "decimals() on d tokens should always return underlying decimals",

    actions: ctx => [
        // TST9 has 6 decimals
        {call: 'tokens.TST9.decimals', args: [], equals: [6] },
        {call: 'dTokens.dTST9.decimals', args: [], equals: [6] },

        // TST10 has 0 decimals
        { send: 'tokens.TST10.mint', args: [ctx.wallet.address, 100], },
        { send: 'tokens.TST10.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST10.deposit', args: [0, 50] },

        // borrow TST10 with TST2 collateral
        { from: ctx.wallet3, send: 'dTokens.dTST10.borrow', args: [0, 1], },

        {call: 'tokens.TST10.decimals', args: [], equals: [0] },
        {call: 'dTokens.dTST10.decimals', args: [], equals: [0] },
    ],
})


.test({
    desc: "no dust left over after max uint withdraw",
    actions: ctx => [
        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1, 6)], },
        { send: 'eTokens.eTST9.withdraw', args: [0, et.units(.2, 6)], },
        { call: 'eTokens.eTST9.totalSupply', args: [], equals: [et.units('0.8', 18), et.formatUnits(et.DefaultReserve)], },
        { from: ctx.wallet3, send: 'dTokens.dTST9.borrow', args: [0, et.units(.3, 6)], },
        { action: 'setIRM', underlying: 'TST9', irm: 'IRM_FIXED', },
        { send: 'tokens.TST9.mint', args: [ctx.wallet3.address, et.units('0.1', 6)], },


        { action: 'jumpTime', time: 2628000, }, // 1 month in seconds
        { action: 'mineEmptyBlock', },

        { from: ctx.wallet3, send: 'dTokens.dTST9.repay', args: [0,  et.units('0.302511', 6)], },

        { send: 'eTokens.eTST9.withdraw', args: [0, et.MaxUint256], },
        { call: 'eTokens.eTST9.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: "total supply of underlying",
    actions: ctx => [
        { send: 'eTokens.eTST9.deposit', args: [0, et.units(1.5, 6)], },

        { call: 'eTokens.eTST9.totalSupply', equals: [et.units('1.5', 18), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST9.totalSupplyUnderlying', equals: [et.units('1.5', 6), et.formatUnits(et.DefaultReserve)], },
    ],
})

.run();
