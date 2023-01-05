const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


function apy(v, tolerance) {
    let apr = Math.log(v + 1);

    let spy = et.BN(Math.floor(apr * 1e6))
              .mul(et.BN(10).pow(27 - 6))
              .div(et.SecondsPerYear);

    return spy;
}

function apyInterpolate(apy, frac) {
    return Math.exp(Math.log(1 + apy) * frac) - 1;
}

const encodeParams = (params = {}) => et.abiEncode(
    ['tuple(int64 baseRate,uint64 slope1,uint64 slope2,uint32 kink)'],
    [{ // IRMDefault default params
        baseRate: params.baseRate || 0,
        slope1: params.slope1 || 1406417851,
        slope2: params.slope2 || 19050045013,
        kink: params.kink || 2147483648,
    }],
);

et.testSet({
    desc: "irm linear kink configurable",
    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
        { from: ctx.wallet2, send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, borrowFactor: .9}, },
        { action: 'setAssetConfig', tok: 'TST2', config: { borrowIsolated: false }, },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.083', },
    ]
})



.test({
    desc: "APRs",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams() },
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



.test({
    desc: "per market configuration",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams() },
        { action: 'setReserveFee', underlying: 'TST2', fee: 0, },
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams({
            // class mega
            slope1: 709783723,
            slope2: 37689273223,
            kink: 3435973836,
        }) },
        { action: 'setReserveFee', underlying: 'TST3', fee: 0, },

        // 25% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(apyInterpolate(.1, .5)), 1e-5], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(2.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST3.address], equals: [apy(apyInterpolate(.08, 0.25 / 0.8)), 1e-4], },


        // 100% utilisation
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(7.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST2.address], equals: [apy(3), 1e-4], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(7.5)], },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST3.address], equals: [apy(2), 1e-4], },
    ],
})



.test({
    desc: "min / max interest rate",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams({ baseRate: -1 }),
            expectError: 'e/irm-configurable/min-allowed-ir' },

        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams({ slope1: et.BN(2).pow(64).sub(1) }),
            expectError: 'e/irm-configurable/max-allowed-ir' },

        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_CONFIGURABLE', resetParams: encodeParams({ slope2: et.BN(2).pow(64).sub(1) }),
            expectError: 'e/irm-configurable/max-allowed-ir' },
    ],
})



.run();
