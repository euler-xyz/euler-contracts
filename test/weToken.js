const et = require('./lib/eTestLib');


et.testSet({
    desc: "weTokens",

    preActions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },

        { send: 'markets.activateWEToken', args: [ctx.contracts.eTokens.eTST.address], },
        { action: 'cb', cb: async () => {
            ctx.contracts.weTokens = {};
            let weTokenAddr = await ctx.contracts.markets.eTokenToWEToken(ctx.contracts.eTokens.eTST.address);
            ctx.contracts.weTokens['weTST'] = await ethers.getContractAt('WEToken', weTokenAddr);

            let eweTokenAddr = await ctx.contracts.markets.underlyingToEToken(weTokenAddr);
            ctx.contracts.eTokens['eweTST'] = await ethers.getContractAt('EToken', eweTokenAddr);

            let dweTokenAddr = await ctx.contracts.markets.underlyingToDToken(weTokenAddr);
            ctx.contracts.dTokens['dweTST'] = await ethers.getContractAt('DToken', dweTokenAddr);
        }},
        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.TST2.address], },
        { action: 'cb', cb: async () => {
            ctx.contracts.pTokens = {};
            let pTokenAddr = await ctx.contracts.markets.underlyingToPToken(ctx.contracts.tokens.TST2.address);
            ctx.contracts.pTokens['pTST2'] = await ethers.getContractAt('PToken', pTokenAddr);

            let epTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.pTokens['pTST2'].address);
            ctx.contracts.eTokens['epTST2'] = await ethers.getContractAt('EToken', epTokenAddr);

            let dpTokenAddr = await ctx.contracts.markets.underlyingToDToken(ctx.contracts.pTokens['pTST2'].address);
            ctx.contracts.dTokens['dpTST2'] = await ethers.getContractAt('DToken', dpTokenAddr);
        }},
    ],
})


.test({
    desc: "activating weToken not possible on non-eTokens or epTokens",
    actions: ctx => [
        { send: 'markets.activateWEToken', args: [ctx.contracts.tokens.UTST.address], expectError: 'e/wetoken/invalid-etoken', },

        { send: 'markets.activateWEToken', args: [ctx.contracts.eTokens.epTST2.address], expectError: 'e/wetoken/invalid-etoken-underlying', },
    ]
})


.test({
    desc: "getters",
    actions: ctx => [
        { call: 'weTokens.weTST.name', args: [], assertEql: 'Wrapped Euler Pool: Test Token', },
        { call: 'weTokens.weTST.symbol', args: [], assertEql: 'weTST', },
        { call: 'weTokens.weTST.decimals', args: [], equals: 18, },
        { call: 'weTokens.weTST.eToken', args: [], onResult: async (r) => {
            et.expect(r).to.equal(ctx.contracts.eTokens.eTST.address);
        }, },
    ],
})


.test({
    desc: "basic wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.weTokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingForwarded).to.equal(et.AddressZero);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.expect(r.pricingType).to.equal(5);
            et.expect(r.pricingForwarded).to.equal(ctx.contracts.eTokens.eTST.address);
        }},

        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.expect(r.eTokenAddress).to.equal(ctx.contracts.eTokens.eweTST.address);
            et.expect(r.borrowIsolated).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0);
            et.expect(r.borrowFactor).to.equal(0);
        } },

        { send: 'weTokens.weTST.wrap', args: [et.eth(11)], },
        { call: 'weTokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 11, },
        { call: 'weTokens.weTST.totalSupply', args: [], equals: 11, },

        { send: 'weTokens.weTST.unwrap', args: [et.eth(11.1)], expectError: 'insufficient balance', },
        { send: 'weTokens.weTST.claimSurplus', args: [ctx.wallet.address], expectError: 'no surplus balance to claim', },

        { send: 'weTokens.weTST.unwrap', args: [et.eth(1)], },
        { call: 'weTokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 10, },

        { send: 'eTokens.eweTST.deposit', args: [0, et.eth(5)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
        }, },


        { send: 'dTokens.dweTST.borrow', args: [0, et.eth(.1)], expectError: 'e/collateral-violation', },
        { send: 'eTokens.eweTST.mint', args: [0, et.eth(.1)], expectError: 'e/collateral-violation', },
    ],
})



.test({
    desc: "arbitrary user can't force unwrap",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.weTokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },
        { send: 'weTokens.weTST.wrap', args: [et.eth(11)], },

        { send: 'weTokens.weTST.creditUnwrap', args: [ctx.wallet.address, et.eth(1)], expectError: 'permission denied', },
    ],
})


.test({
    desc: "batch wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },

        { action: 'sendBatch', batch: [
            { send: 'exec.weTokenWrap', args: [0, ctx.contracts.eTokens.eTST.address, et.eth(11)], },
            { send: 'eTokens.eweTST.deposit', args: [0, et.eth(5)], },
            { send: 'markets.enterMarket', args: [0, ctx.contracts.weTokens.weTST.address], },
        ]},

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
        }, },
        { call: 'weTokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet.address], equals: 5, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 89, },

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eweTST.withdraw', args: [0, et.eth(1)], },
            { send: 'exec.weTokenUnWrap', args: [0, ctx.contracts.eTokens.eTST.address, et.eth(1)], },
        ]},

        { call: 'weTokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet.address], equals: [4, 1e-6], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 90, },
    ],
})


.test({
    desc: "activate market for wetoken",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.weTokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },
        { send: 'weTokens.weTST.wrap', args: [et.eth(11)], },

        { send: 'markets.activateMarket', args: [ctx.contracts.weTokens.weTST.address], expectError: 'e/markets/invalid-token', },
        { send: 'markets.activatePToken', args: [ctx.contracts.weTokens.weTST.address], expectError: 'e/ptoken/invalid-underlying', },
        { send: 'markets.activateWEToken', args: [ctx.contracts.weTokens.weTST.address], expectError: 'e/wetoken/invalid-etoken', },
        { send: 'markets.activateWEToken', args: [ctx.contracts.eTokens.eweTST.address], expectError: 'e/nested-wetoken', },
    ],
})


.test({
    desc: "price forwarding",
    actions: ctx => [
        () => { et.assert(et.BN(ctx.contracts.tokens.TST.address).gt(ctx.contracts.tokens.WETH.address), 'TST/WETH pair is not inverted') },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '1.23', },

        // price starts equal when exchange rate is 1
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(1)], equals: 1 },

        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }},
        { call: 'exec.getPrice', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }},
        { call: 'exec.getPriceFull', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.equals(r.currPrice, '1.23', '0.0001')
        }},

        // price increases with the exchange rate
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'eTokens.eTST.mint', args: [0, et.eth(100)], },

        { action: 'jumpTimeAndMine', time: 300 * 86400, },
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(1)], equals: [1.03, 0.002], onResult: r => {
            ctx.stash.exchangeRate = r;
        } },

        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
            ctx.stash.twap = r.twap;
        }},
        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.equals(r.currPrice, '1.23', '0.0001')
            ctx.stash.currPrice = r.currPrice;
        }},
        { call: 'exec.getPrice', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.equals(r.twap, ctx.stash.twap.mul(ctx.stash.exchangeRate).div(et.c1e18));
        }},
        { call: 'exec.getPriceFull', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.equals(r.currPrice, ctx.stash.currPrice.mul(ctx.stash.exchangeRate).div(et.c1e18));
        }},

        // chainlink
        { action: 'cb', cb: async () => {
            // deploy mock chainlink aggregators and corresponding mock oracle

            ctx.contracts.MockChainlinkAggregator_anyUSD = await (await ctx.factories.MockAggregatorProxy.deploy(8)).deployed();
            ctx.contracts.MockChainlinkAggregator_ETHUSD = await (await ctx.factories.MockAggregatorProxy.deploy(8)).deployed();

            ctx.contracts.MockOracle = await (
                await ctx.factories.ChainlinkBasedOracle.deploy(
                    ctx.contracts.MockChainlinkAggregator_anyUSD.address,
                    ctx.contracts.MockChainlinkAggregator_ETHUSD.address,
                    "any/ETH"
                )
            ).deployed();
        }},
        { send: 'governance.setChainlinkPriceFeed', args: [ctx.contracts.tokens.TST.address, () => ctx.contracts.MockOracle.address]},
        { send: 'governance.setPricingConfig', args: [ctx.contracts.tokens.TST.address, 4, 0], },

        // Update mocked prices

        { send: 'MockChainlinkAggregator_anyUSD.mockSetData', args: [[1, 2, 0, 0, 0]], },
        { send: 'MockChainlinkAggregator_ETHUSD.mockSetData', args: [[1, 1, 0, 0, 0]], },
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(1)], equals: [1.03, 0.002], onResult: r => {
            ctx.stash.exchangeRate = r;
        } },

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.equals(r.currPrice, '2');
            et.equals(r.twap, '2');
            ctx.stash.currPrice = r.currPrice;
        }},

        { call: 'exec.getPriceFull', args: [ctx.contracts.weTokens.weTST.address], onResult: r => {
            et.equals(r.currPrice, ctx.stash.currPrice.mul(ctx.stash.exchangeRate).div(et.c1e18));
            et.equals(r.currPrice, r.twap);
        }},
    ],
})


.test({
    desc: "activate already activated wetoken",
    actions: ctx => [
        { callStatic: 'markets.activateWEToken', args: [ctx.contracts.eTokens.eTST.address], onResult: r => {
            et.assert(r === ctx.contracts.weTokens.weTST.address)
        }, },
    ],
})


.test({
    desc: "approve / allowance",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },
        { send: 'weTokens.weTST.wrap', args: [et.eth(10)], },
        { send: 'weTokens.weTST.approve', args: [ctx.wallet2.address, et.eth(5)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.weTokens.weTST.address);
            et.expect(logs.length).to.equal(1); 
            // Approval event
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet2.address);
            et.assert(logs[0].args.value.eq(et.eth(5)));
        }},

        { from: ctx.wallet2, send: 'weTokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(6)], expectError: 'insufficient allowance', },

        { from: ctx.wallet2, send: 'weTokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(3)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.weTokens.weTST.address);
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

        { call: 'weTokens.weTST.allowance', args: [ctx.wallet.address, ctx.wallet2.address], equals: 2, },

        { send: 'weTokens.weTST.approve', args: [ctx.wallet2.address, et.eth(10)], },
        {from: ctx.wallet2, send: 'weTokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(10)], expectError: 'insufficient balance', },
    ],
})


.test({
    desc: "wrap non existing ptoken",
    actions: ctx => [
        { send: 'exec.weTokenWrap', args: [0, ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/wetoken-not-found' },
    ],
})


.test({
    desc: "unwrap non existing ptoken",
    actions: ctx => [
        { send: 'exec.weTokenUnWrap', args: [0, ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/wetoken-not-found' },
    ],
})


.test({
    desc: "nested price forwarding",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 3),
        { call: 'exec.getPrice', args: [ctx.contracts.weTokens.weTST.address], expectError: 'e/nested-price-forwarding' },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 5),
        { call: 'exec.getPrice', args: [ctx.contracts.weTokens.weTST.address], expectError: 'e/nested-price-forwarding' },
    ],
})


.test({
    desc: "unwrap to self-collateralised debt",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },
        { action: 'setAssetConfig', tok: 'TST', config: { borrowIsolated: false, }, },
        { action: 'setAssetConfig', tok: 'TST3', config: { borrowIsolated: false, }, },

        { send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },
        { send: 'eTokens.eTST.mint', args: [0, et.eth(1)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.b = r
        }},
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },
        { send: 'weTokens.weTST.wrap', args: [() => ctx.stash.b], },

        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(.1),], },

        // collateral: TST2, debt: TST and TST3. Unwrapping TST creates self-collateralised TST debt
        { send: 'weTokens.weTST.unwrap', args: [et.eth(1)], expectError: 'e/borrow-isolation-violation' },
        { send: 'exec.weTokenUnWrap', args: [0, ctx.contracts.eTokens.eTST.address, et.eth(1)], expectError: 'e/borrow-isolation-violation' },
    ],
})


.test({
    desc: "ewetokens are not mintable",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.weTokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.weTokens.weTST.address, et.MaxUint256,], },
        { send: 'weTokens.weTST.wrap', args: [et.eth(11)], },
        { send: 'eTokens.eweTST.deposit', args: [0, et.MaxUint256,], },

        { send: 'eTokens.eweTST.mint', args: [0, et.eth(.01),], expectError: 'e/collateral-violation', },
    ],
})


.run();
