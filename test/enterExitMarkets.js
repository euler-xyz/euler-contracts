const et = require('./lib/eTestLib');


et.testSet({
    desc: "entering/exiting markets",

    preActions: ctx => {
        let actions = [];

        // Need to setup uniswap prices for exitMarket tests

        actions.push({ action: 'checkpointTime', });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "normal flow",
    actions: ctx => [
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address], assertEql: [], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.WETH.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.WETH.address], },

        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.WETH.address], },

        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.WETH.address], },

        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.WETH.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [], },
    ],
})


.test({
    desc: "exit un-entered market",
    actions: ctx => [
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.WETH.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], },
    ],
})


.test({
    desc: "try to enter market already in",
    actions: ctx => [
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address], },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address], },
    ],
})



.test({
    desc: "unactivated markets",
    actions: ctx => [
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.UTST.address], expectError: 'e/market-not-activated', },
        { send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.UTST.address], expectError: 'e/market-not-activated', },
    ],
})


.run();
