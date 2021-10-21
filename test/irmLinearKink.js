const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


function apr(v) {
    let spr = ethers.BigNumber.from(Math.floor(v * 1e6))
              .mul(ethers.BigNumber.from(10).pow(27 - 6))
              .div(et.SecondsPerYear);

    return [spr, 1e-4];
}



et.testSet({
    desc: "irm linear kink",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "APRs",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_DEFAULT', },
        { action: 'setReserveFee', underlying: 'TST2', fee: 0, },

        // 0% utilisation
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: apr(0), },

        // 50% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: apr(.1 * 5/8), },

        // 80% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(3)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: apr(.1), },

        // 90% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: apr(.1 + 1.4/2), },

        // 100% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(1)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: apr(.1 + 1.4), },
    ],
})



.run();
