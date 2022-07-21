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
    desc: "activating pToken with non-activated underlying should revert",
    actions: ctx => [
        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.UTST.address], expectError: 'e/market-not-activated', },

        { from: ctx.wallet, send: 'markets.activateMarket', args: [ctx.contracts.tokens.UTST.address], },

        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.UTST.address], expectError: 'e/ptoken/not-collateral', },
    ]
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
        { send: 'tokens.TST.approve', args: [ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pTST.address], },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingForwarded).to.equal(et.AddressZero);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.pTokens.pTST.address], onResult: r => {
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

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 3.75, 0.001);
        }, },

        { send: 'dTokens.dpTST.borrow', args: [0, et.eth(.1)], expectError: 'e/borrow-not-supported', },
        { send: 'eTokens.epTST.mint', args: [0, et.eth(.1)], expectError: 'e/borrow-not-supported', },
    ],
})



.test({
    desc: "arbitrary user can't force unwrap",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pTST.address], },

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
            { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pTST.address], },
        ]},

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
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


.test({
    desc: "activate market for ptoken",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pTST.address], },
        { send: 'pTokens.pTST.wrap', args: [et.eth(11)], },
        { send: 'markets.activateMarket', args: [ctx.contracts.pTokens.pTST.address], expectError: 'e/markets/invalid-token', },
        { send: 'markets.activatePToken', args: [ctx.contracts.pTokens.pTST.address], expectError: 'e/nested-ptoken', },
    ],
})


.test({
    desc: "price forwarding",
    actions: ctx => [
        () => { et.assert(ethers.BigNumber.from(ctx.contracts.tokens.TST.address).gt(ctx.contracts.tokens.WETH.address), 'TST/WETH pair is not inverted') },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '1.23', },
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }},
        { call: 'exec.getPrice', args: [ctx.contracts.pTokens.pTST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }}
    ],
})


.test({
    desc: "price forwarding 2",
    actions: ctx => [
        { action: 'setAssetConfig', tok: 'TST6', config: { collateralFactor: 0.7, }, },
        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.TST6.address], },
        async () => {
            et.assert(ethers.BigNumber.from(ctx.contracts.tokens.TST6.address).lt(ctx.contracts.tokens.WETH.address), 'TST6/WETH pair is inverted');
            let pTokenAddr = await ctx.contracts.markets.underlyingToPToken(ctx.contracts.tokens.TST6.address);
            ctx.contracts.pTokens['pTST6'] = await ethers.getContractAt('PToken', pTokenAddr);
        },
        { action: 'updateUniswapPrice', pair: 'TST6/WETH', price: '1.23', },
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST6.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }},
        { call: 'exec.getPrice', args: [() => ctx.contracts.pTokens.pTST6.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }}
    ],
})


.test({
    desc: "activate already activated ptoken",
    actions: ctx => [
        { callStatic: 'markets.activatePToken', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.assert(r === ctx.contracts.pTokens.pTST.address)
        }, },
    ],
})


.test({
    desc: "activate ptoken on non collateral underlying",
    actions: ctx => [
        { callStatic: 'markets.activatePToken', args: [ctx.contracts.tokens.TST3.address], expectError: 'e/ptoken/not-collateral' },
    ],
})


.test({
    desc: "approve / allowance",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.pTokens.pTST.address, et.MaxUint256,], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pTST.address], },
        { send: 'pTokens.pTST.wrap', args: [et.eth(10)], },
        { send: 'pTokens.pTST.approve', args: [ctx.wallet2.address, et.eth(5)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.pTokens.pTST.address);
            et.expect(logs.length).to.equal(1); 
            // Approval event
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet2.address);
            et.assert(logs[0].args.value.eq(et.eth(5)));
        }},

        {from: ctx.wallet2, send: 'pTokens.pTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(6)], expectError: 'insufficient allowance', },

        { from: ctx.wallet2, send: 'pTokens.pTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(3)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.pTokens.pTST.address);
            // Approval and Transfer
            et.expect(logs.length).to.equal(2); 
            // Approval event
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet2.address);
            et.assert(logs[0].args.value.eq(et.eth(2)));

            // Transfer event
            et.expect(logs[1].name).to.equal('Transfer');
            et.expect(logs[1].args.from).to.equal(ctx.wallet.address);
            et.expect(logs[1].args.to).to.equal(ctx.wallet2.address);
            et.assert(logs[1].args.value.eq(et.eth(3)));
        }},

        { call: 'pTokens.pTST.allowance', args: [ctx.wallet.address, ctx.wallet2.address], equals: 2, },

        { send: 'pTokens.pTST.approve', args: [ctx.wallet2.address, et.eth(10)], },
        {from: ctx.wallet2, send: 'pTokens.pTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(10)], expectError: 'insufficient balance', },
    ],
})


.test({
    desc: "wrap non existing ptoken",
    actions: ctx => [
        { send: 'exec.pTokenWrap', args: [ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/ptoken-not-found' },
    ],
})


.test({
    desc: "unwrap non existing ptoken",
    actions: ctx => [
        { send: 'exec.pTokenUnWrap', args: [ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/ptoken-not-found' },
    ],
})


.test({
    desc: "wrap balance mismatch on inflationary token",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'tokens.TST.configure', args: ['transfer/inflationary', et.abiEncode(['uint256'], [et.eth(1)])], },
        { send: 'exec.pTokenWrap', args: [ctx.contracts.tokens.TST.address, et.eth(1)], expectError: 'e/exec/ptoken-transfer-mismatch' },
    ],
})


.test({
    desc: "nested price forwarding",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 3),
        { call: 'exec.getPrice', args: [ctx.contracts.pTokens.pTST.address], expectError: 'e/nested-price-forwarding' },
    ],
})


.run();
