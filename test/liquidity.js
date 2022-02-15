const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "liquidity calculations",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "borrow isolation",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },
        { from: ctx.wallet2, send: 'dTokens.dTST2.borrow', args: [0, et.eth('0.00000000001')], expectError: 'e/borrow-isolation-violation', },
    ],
})



.test({
    desc: "simple liquidity",
    actions: ctx => [
        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 10 * 2 * .75, .002); // amount * price * collateralFactor = 15
            et.equals(r[0].status.liabilityValue, 0);

            et.equals(r[1].status.collateralValue, 0);
            et.equals(r[1].status.liabilityValue, 0);
        }, },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
            et.equals(r[0].status.liabilityValue, 0);

            et.equals(r[1].status.collateralValue, 10 * 0.083 * .75, 0.0001); // 0.6225
            et.equals(r[1].status.liabilityValue, 0);
        }, },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
            et.equals(r[0].status.liabilityValue, 0.1 * 2 / .4, 0.0001); // 0.5

            et.equals(r[1].status.collateralValue, 10 * 0.083 * .75, 0.0001);
            et.equals(r[1].status.liabilityValue, 0);
        }, },

        // No liquidation possible:

        { send: 'liquidation.liquidate', args: [ctx.wallet2.address, ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, 1, 0],
          expectError: 'e/liq/excessive-repay-amount',
        },

        // So 0.6225 - 0.5 = 0.1225 liquidity left
        // 0.1225 = X * 2 / .4
        // X = .0245 (max TST that can be borrowed)

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(0.0246)], expectError: 'e/collateral-violation', },

        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(0.0244)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
            et.equals(r[0].status.liabilityValue, (.1 + 0.0244) * 2 / .4, 0.0001);

            et.equals(r[1].status.collateralValue, 10 * 0.083 * .75, 0.0001);
            et.equals(r[1].status.liabilityValue, 0);
        }, },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], equals: [0.1244, 0.0001], },
    ],
})


.test({
    desc: "transfer eTokens",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet2.address], equals: et.eth(10), },
        { from: ctx.wallet2, send: 'eTokens.eTST2.transfer', args: [ctx.wallet3.address, et.eth(10)], expectError: 'e/collateral-violation', },

        // From previous test, after borrowing 0.1 TST, liquidity left is 0.1225
        // 0.1225 = X * 0.083 * .75
        // Max TST2 available to transfer: 1.96787148594377510040
        // Note: In this test we are only depositor so can assume 1:1 eToken balance to underlying amount

        { from: ctx.wallet2, send: 'eTokens.eTST2.transfer', args: [ctx.wallet3.address, et.eth('1.969')], expectError: 'e/collateral-violation', },

        { from: ctx.wallet2, send: 'eTokens.eTST2.transfer', args: [ctx.wallet3.address, et.eth('1.967')], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.liabilityValue, 0.5, 0.001);
            et.equals(r[1].status.collateralValue, 0.5, 0.001);
        }, },

        { from: ctx.wallet2, send: 'eTokens.eTST2.transfer', args: [ctx.wallet3.address, et.eth(0.002)], expectError: 'e/collateral-violation', },
    ],
})




.test({
    desc: "transfer dTokens",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.liabilityValue, 0.5, 0.0001);
        }, },


        // wallet3 deposits 6 TST2, giving collateralValue = 6 * 0.083 * .75 = 0.3735

        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, et.eth(6)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r[1].status.collateralValue, 6 * 0.083 * .75, 0.0001);
        }, },


        // we're going to approve wallet2 to transfer dTokens to wallet3

        { from: ctx.wallet3, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet2.address, et.MaxUint256], },


        // The maximum amount of dTokens that can be transferred is:
        // 0.3735 = X * 2 / .4
        // X = .0747

        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet3.address, et.eth('.0748')], expectError: 'e/collateral-violation', },

        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet3.address, et.eth('.0746')], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet3.address], onResult: r => {
            et.equals(r[0].status.liabilityValue, 0.3735, 0.01);
        }, },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r[0].status.liabilityValue, 0.5 - 0.3735, 0.01);
        }, },
    ],
})



.test({
    desc: "exit market",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.1)], },

        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], expectError: 'e/outstanding-borrow', },
        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], expectError: 'e/collateral-violation', },

        { from: ctx.wallet2, send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(1)], },
        { from: ctx.wallet2, send: 'dTokens.dTST.repay', args: [0, et.MaxUint256], },

        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet2, send: 'markets.exitMarket', args: [0, ctx.contracts.tokens.TST2.address], },
    ],
})


.run();
