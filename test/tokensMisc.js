const et = require('./lib/eTestLib');

et.testSet({
    desc: "tokens misc",
})


.test({
    desc: "names and symbols",
    actions: ctx => [
        { call: 'eTokens.eTST.name', args: [], assertEql: 'Euler Pool: Test Token', },
        { call: 'eTokens.eTST.symbol', args: [], assertEql: 'eTST', },
        { call: 'dTokens.dTST.name', args: [], assertEql: 'Euler Debt: Test Token', },
        { call: 'dTokens.dTST.symbol', args: [], assertEql: 'dTST', },
    ],
})


.test({
    desc: "underlyingAsset",
    actions: ctx => [
        { call: 'eTokens.eTST.underlyingAsset', args: [], assertEql: ctx.contracts.tokens.TST.address, },
        { call: 'dTokens.dTST.underlyingAsset', args: [], assertEql: ctx.contracts.tokens.TST.address, },
    ],
})


.test({
    desc: "initial supplies and balances",
    actions: ctx => [
        // Total supply is the default reserves = 1e6 wei or et.eth('0.000000000001')
        { call: 'eTokens.eTST.totalSupply', args: [], assertEql: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], assertEql: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(0), },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.totalSupplyExact', args: [], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet.address], assertEql: et.eth(0), },
    ],
})



.run();
