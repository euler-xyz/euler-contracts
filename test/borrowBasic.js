const et = require('./lib/eTestLib');

et.testSet({
    desc: "borrow basic",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "basic borrow and repay, with no interest",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
          assertEql: [ctx.contracts.tokens.TST2.address], },

        // Repay when nothing owed is a no-op

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth(100)], },

        // Two separate borrows, .4 and .1:

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.4)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.dTokens.dTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(et.AddressZero);
            et.expect(logs[0].args.to).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.value).to.equal(et.eth(.4));
        }},
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },
        { action: 'checkpointTime', },

        // Make sure the borrow entered us into the market
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
          assertEql: [ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        // Wait 1 day

        { action: 'jumpTime', time: 86400, },
        { action: 'mineEmptyBlock', },

        // No interest was charged

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth(0.5)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.dTokens.dTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.to).to.equal(et.AddressZero);
            et.expect(logs[0].args.value).to.equal(et.eth(.5));
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "basic borrow and repay, very small interest",
    actions: ctx => [
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        // Mint some extra so we can pay interest
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(0.1)], },
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000003170979198376458650', 27), },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.5)], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000006341958406808026377', 27), }, // 1 second later, so previous accumulator squared

        // 1 block later, notice amount owed is rounded up:

        { action: 'mineEmptyBlock', },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address],        assertEql: et.eth('0.500000001585489600'), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.units('0.500000001585489599188229324', 27), },

        // Try to pay off full amount:

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth('0.500000001585489600')], },

        // Tiny bit more accrued in previous block:

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address],        assertEql: et.eth('0.000000001585489604'), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.units('0.000000001585489604000000000', 27), },

        // Use max uint to actually pay off full amount:

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.MaxUint256], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "fractional debt amount",
    actions: ctx => [
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units(1, 27), },

        // Mint some extra so we can pay interest
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(0.1)], },
        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000003170979198376458650', 27), },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.5)], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        { call: 'markets.interestAccumulator', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('1.000000006341958406808026377', 27), }, // 1 second later, so previous accumulator squared

        // Turn off interest, but 1 block later so amount owed is rounded up:

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address],        assertEql: et.eth('0.500000001585489600'), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.units('0.500000001585489599188229324', 27), },

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth('0.500000001585489599')], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.units('1', 0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], equals: et.units('1', 9), },

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.units('2', 0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], equals: et.units('1.000000003', 9), },

        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, 2], },

        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], equals: 0, },

        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
    ],
})


.test({
    desc: "amounts at the limit",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        // Try to borrow more tokens than exist in the pool:

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(100000)], expectError: 'e/insufficient-tokens-available', },

        // Max uint specifies all the tokens in the pool, which is 1 TST:

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: et.eth(1), },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(100), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(0), },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], equals: et.eth(0), },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(101), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: et.eth(1), },
    ],
})


.run();
