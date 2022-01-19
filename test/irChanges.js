const et = require('./lib/eTestLib');

et.testSet({
    desc: "changing interest rates",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(0.5)], });
        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(0.5)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})



.test({
    desc: "IRMLinear",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_LINEAR', },

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.units('0.0', 27), },

        // Mint some extra so we can pay interest
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(0.1)], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1), },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.5)], },
        { action: 'checkpointTime', },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(0.5), },

        // 50% of pool loaned out
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.5', '0.5'), },

        // 1 block later

        { action: 'jumpTimeAndMine', time: 1, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth('0.500000000792218463'), },

        // Interest rate unchanged, because no operations called that would update it

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.5', '0.5'), },

        // Borrow a little more

        { action: 'jumpTime', time: 1, },
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.2)], },

        // New loan plus 2 blocks worth of interest at previous IR

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth('0.700000001584436926'), },

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.700000001584436926', '0.3'), },

        // 1 block later

        { action: 'jumpTimeAndMine', time: 1, },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth('0.700000003137185117'), },

        // IR unchanged

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.700000001584436926', '0.3'), },

        // Re-pay some:

        { action: 'jumpTime', time: 1, },
        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.eth('0.4')], },

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.300000004693049228', '0.7'), },

        // Now wallet deposits a bit more

        { action: 'jumpTime', time: 1, },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(.6)], },

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.300000004978437363', '1.3'), },

        // Now wallet withdraws some

        { action: 'jumpTime', time: 1, },
        { from: ctx.wallet, send: 'eTokens.eTST.withdraw', args: [0, et.eth(.2)], },

        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('0.300000005156804948', '1.1'), },
    ],
})



.run();
