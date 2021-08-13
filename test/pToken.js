const et = require('./lib/eTestLib');


et.testSet({
    desc: "pTokens",

    preActions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], },

        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.TST.address], },
        { action: 'cb', cb: async () => {
            ctx.contracts.pTokens = {};
            let pTokenAddr = await ctx.contracts.markets.underlyingToPToken(ctx.contracts.tokens.TST.address);
            ctx.contracts.pTokens['pTST'] = await ethers.getContractAt('PToken', pTokenAddr);

            let epTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.pTokens['pTST'].address);
            ctx.contracts.eTokens['epTST'] = await ethers.getContractAt('EToken', epTokenAddr);

            let dpTokenAddr = await ctx.contracts.markets.underlyingToDToken(ctx.contracts.pTokens['pTST'].address);
            ctx.contracts.dTokens['dpTST'] = await ethers.getContractAt('DToken', dpTokenAddr);
        }},
    ],
})


.test({
    desc: "getters",
    actions: ctx => [
        { call: 'pTokens.pTST.name', args: [], assertEql: 'Euler Protected Test Token', },
        { call: 'pTokens.pTST.symbol', args: [], assertEql: 'pTST', },
        { call: 'pTokens.pTST.decimals', args: [], equals: 18, },
        { call: 'pTokens.pTST.underlying', args: [], onResult: async (r) => {
            et.expect(r).to.equal(ctx.contracts.tokens.TST.address);
        }, },
    ],
})


.test({
    desc: "basic wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [() => ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, () => ctx.contracts.pTokens.pTST.address], },

        { call: 'markets.getPricingConfig', args: [() => ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingForwarded).to.equal(et.AddressZero);
        }},

        { call: 'markets.getPricingConfig', args: [() => ctx.contracts.pTokens.pTST.address], onResult: r => {
            et.expect(r.pricingType).to.equal(3);
            et.expect(r.pricingForwarded).to.equal(ctx.contracts.tokens.TST.address);
        }},

        { send: 'pTokens.pTST.wrap', args: [et.eth(11)], },
        { call: 'pTokens.pTST.balanceOf', args: [ctx.wallet.address], equals: 11, },
        { call: 'pTokens.pTST.totalSupply', args: [], equals: 11, },

        { send: 'pTokens.pTST.unwrap', args: [et.eth(11.1)], expectError: 'insufficient balance', },
        { send: 'pTokens.pTST.claimSurplus', args: [ctx.wallet.address], expectError: 'no surplus balance to claim', },

        { send: 'pTokens.pTST.unwrap', args: [et.eth(1)], },
        { call: 'pTokens.pTST.balanceOf', args: [ctx.wallet.address], equals: 10, },

        { send: 'eTokens.epTST.deposit', args: [0, et.eth(5)], },

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 3.75, 0.001);
        }, },

        { send: 'dTokens.dpTST.borrow', args: [0, et.eth(.1)], expectError: 'e/borrow-not-supported', },
        { send: 'eTokens.epTST.mint', args: [0, et.eth(.1)], expectError: 'e/borrow-not-supported', },
    ],
})



.test({
    desc: "arbitrary user can't force unwrap",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [() => ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, () => ctx.contracts.pTokens.pTST.address], },

        { send: 'pTokens.pTST.wrap', args: [et.eth(11)], },

        { send: 'pTokens.pTST.forceUnwrap', args: [ctx.wallet.address, et.eth(1)], expectError: 'permission denied', },
    ],
})


.test({
    desc: "batch wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },

        { action: 'sendBatch', batch: [
            { send: 'exec.pTokenWrap', args: [ctx.contracts.tokens.TST.address, et.eth(11)], },
            { send: 'eTokens.epTST.deposit', args: [0, et.eth(5)], },
            { send: 'markets.enterMarket', args: [0, () => ctx.contracts.pTokens.pTST.address], },
        ]},

        { callStatic: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 3.75, 0.001);
        }, },

        { call: 'pTokens.pTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: 89, },

        { action: 'sendBatch', batch: [
            { send: 'eTokens.epTST.withdraw', args: [0, et.eth(1)], },
            { send: 'exec.pTokenUnWrap', args: [ctx.contracts.tokens.TST.address, et.eth(1)], },
        ]},

        { call: 'pTokens.pTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: 90, },
    ],
})


.run();
