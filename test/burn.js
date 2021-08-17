const et = require('./lib/eTestLib');

et.testSet({
    desc: "burn",

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
    desc: "burn when owed amount is 0 is a no-op",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
            assertEql: [ctx.contracts.tokens.TST2.address], },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(99), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        
        { from: ctx.wallet2, send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(99), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "burning eTokens with insufficient balance reverts",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
            assertEql: [ctx.contracts.tokens.TST2.address], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },

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

        { from: ctx.wallet2, send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], expectError: 'e/insufficient-balance', },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },
    ],
})


.test({
    desc: "burn for 0 is a no-op, burn for max_uint256 burns full owed amount and repay when owed amount is 0 is a no-op",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet2.address],
            assertEql: [ctx.contracts.tokens.TST2.address], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },

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

        // burning 0 is a no-op 
        { from: ctx.wallet2, send: 'eTokens.eTST.burn', args: [0, 0], }, 

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(100.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },
        
        // Wait 1 day

        { action: 'jumpTime', time: 86400, },
        { action: 'mineEmptyBlock', },

        // No interest was charged
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        { from: ctx.wallet2, send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], expectError: 'e/insufficient-balance', },

        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        // burn for max_uint256 burns full owed amount with nothing to repay
        { from: ctx.wallet2, send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(99.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        // repay when owed amount is 0 is a no-op
        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth(0.5)], }, 

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(99.5), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet2.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
    ],
})


.run();