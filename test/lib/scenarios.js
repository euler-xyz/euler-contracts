const et = require('./eTestLib');


/*
function arrayify(a) {
    if (a === undefined || a === null) return [];
    if (Array.isArray(a)) return a;
    return [a];
}
*/

module.exports = {
/*
    setup: (opts) => ctx => {
        let actions = [];

        if (opts.irm) actions.push({ action: 'setIRM', irm: opts.irm, });

        if (opts.approveEuler) {
            for (let from of arrayify(opts.approveEuler[0])) {
                for (let tok of arrayify(opts.approveEuler[1])) {
                    actions.push({ from: ctx[from], send: `tokens.${tok}.approve`, args: [ctx.contracts.euler.address, et.MaxUint256,], });
                }
            }
        }
    },
    */

    basicLiquidity: () => ctx => {
        let actions = [
            { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
            { action: 'setIRM', underlying: 'TST2', irm: 'IRM_ZERO', },
            { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },
            { action: 'setIRM', underlying: 'TST6', irm: 'IRM_ZERO', },

            { action: 'setAssetConfig', tok: 'WETH', config: { borrowFactor: .4}, },
            { action: 'setAssetConfig', tok: 'TST', config: { borrowFactor: .4}, },
            { action: 'setAssetConfig', tok: 'TST2', config: { borrowFactor: .4}, },
            { action: 'setAssetConfig', tok: 'TST3', config: { borrowFactor: .4}, },
            { action: 'setAssetConfig', tok: 'TST6', config: { borrowFactor: .4}, },
        ];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });

            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], });
            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], });
        }

        for (let from of [ctx.wallet]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(10)], });

        actions.push({ action: 'checkpointTime', });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '0.083', });

        actions.push({ action: 'jumpTimeAndMine', time: 31*60, });

        return actions;
    },
};
