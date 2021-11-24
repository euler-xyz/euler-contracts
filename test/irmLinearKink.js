const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


function apy(v, tolerance) {
    let apr = Math.log(v + 1);

    let spy = ethers.BigNumber.from(Math.floor(apr * 1e6))
              .mul(ethers.BigNumber.from(10).pow(27 - 6))
              .div(et.SecondsPerYear);

    return spy;
}

function apyInterpolate(apy, frac) {
    return Math.exp(Math.log(1 + apy) * frac) - 1;
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
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(0), 1e-5], },

        // 25% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(apyInterpolate(.1, .5)), 1e-5], },

        // 50% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(.1), 1e-5], },

        // 75% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(3).sub(apy(.1)).div(2).add(apy(.1)), 1e-5], },

        // 100% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(3), 1e-4], },
    ],
})



.run();
