const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "views",

    preActions: scenarios.basicLiquidity(),
})


/*
.test({
    desc: "basic view stuff",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_FIXED', },
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },

        { callStatic: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
        }, dump:1 },
    ],
})
*/


.test({
    desc: "basic view",
    actions: ctx => [
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(.1)], },

        { callStatic: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
        }, },
    ],
})




.run();
