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

        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, () => ctx.contracts.pTokens.pTST.address], },
    ],
})



.test({
    desc: "basic wrapping",
    actions: ctx => [
        { call: 'markets.getPricingConfig', args: [() => ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingForwarded).to.equal(et.AddressZero);
        }},

        { call: 'markets.getPricingConfig', args: [() => ctx.contracts.pTokens.pTST.address], onResult: r => {
            et.expect(r.pricingType).to.equal(3);
            et.expect(r.pricingForwarded).to.equal(ctx.contracts.tokens.TST.address);
        }},

        { send: 'pTokens.pTST.wrap', args: [et.eth(11)], },
        { call: 'pTokens.pTST.balanceOf', args: [ctx.wallet.address], equals: 11, },

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



.run();
