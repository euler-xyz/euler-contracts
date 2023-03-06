const et = require('./lib/eTestLib');

const SELF_ADDRESS_PLACEHOLDER = ethers.utils.hexZeroPad(et.BN(2).pow(160).sub(1))

const defaultConfig = ctx => ({
    interestRateModel: 2_001_000,
    interestRateModelResetParams: et.abiEncode(
        ['tuple(int64 baseRate,uint64 slope1,uint64 slope2,uint32 kink)'],
        [{ // IRMDefault params
            baseRate: 0,
            slope1: 1406417851,
            slope2: 19050045013,
            kink: 2147483648,
        }],
    ),
    reserveFee: 0.01 * 4e9,
    reserveRecipient: ctx.wallet.address,
    overrideCollaterals: [
        { 
            underlying: ctx.contracts.tokens.TST.address,
            collateralFactor: 0.8 * 4e9,
        },
        {
            underlying: ctx.contracts.tokens.TST2.address,
            collateralFactor: 0.5 * 4e9
        },
        {
            underlying: SELF_ADDRESS_PLACEHOLDER,
            collateralFactor: 0.2 * 4e9
        },
    ]
})


et.testSet({
    desc: "wrapped eTokens",

    preActions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], },
        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { send: 'tokens.TST2.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], },
        { send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(100)], },
        { send: 'tokens.TST3.mint', args: [ctx.wallet3.address, et.eth(100)], },

        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST.address, defaultConfig(ctx)], onLogs: logs => {
            et.expect(logs[0].args.eToken).to.eq(ctx.contracts.eTokens.eTST.address);
            ctx.stash.weToken = logs[0].args.weToken;
        } },
        { action: 'cb', cb: async () => {
            let weTokenAddr = ctx.stash.weToken;
            ctx.contracts.tokens['weTST'] = await ethers.getContractAt('WEToken', weTokenAddr);

            let eweTokenAddr = await ctx.contracts.markets.underlyingToEToken(weTokenAddr);
            ctx.contracts.eTokens['eweTST'] = await ethers.getContractAt('EToken', eweTokenAddr);

            let dweTokenAddr = await ctx.contracts.markets.underlyingToDToken(weTokenAddr);
            ctx.contracts.dTokens['dweTST'] = await ethers.getContractAt('DToken', dweTokenAddr);
        }},
        { send: 'wrapperExec.activatePToken', args: [ctx.contracts.tokens.TST2.address], },
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
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.tokens.UTST.address, defaultConfig(ctx)], expectError: 'e/wetoken/invalid-etoken', },

        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.epTST2.address, defaultConfig(ctx)], expectError: 'e/wetoken/invalid-etoken-underlying', },
    ]
})


.test({
    desc: "only governance can activate weToken",
    actions: ctx => [
        { from: ctx.wallet2, send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST2.address, defaultConfig(ctx)], expectError: 'e/gov/unauthorized' },
    ]
})


.test({
    desc: "reserve fee",
    actions: ctx => [
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST2.address,
            {...defaultConfig(ctx), reserveFee: 4e9 + 1}], expectError: 'e/wetoken/reserve-fee' },

        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST2.address,
            {...defaultConfig(ctx), reserveFee: 2**32 - 1}], onLogs: async logs => {
                ctx.contracts.tokens['weTST2'] = await ethers.getContractAt('WEToken', logs[0].args.weToken);
        }},

        { call: 'markets.reserveFee', args: [() => ctx.contracts.tokens.weTST2.address], onResult: r => {
            et.expect(r).to.equal(0.23 * 4e9);
        } },
    ]
})


.test({
    desc: "max number of initial overrides",
    actions: ctx => [
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST2.address,
            {
                ...defaultConfig(ctx),
                overrideCollaterals: Array(21).fill({ 
                    underlying: ctx.contracts.tokens.TST.address,
                    collateralFactor: 0.8 * 4e9,
                }),
            }], expectError: 'e/wetoken/too-many-overrides' },
    ]
})


.test({
    desc: "getters",
    actions: ctx => [
        { call: 'tokens.weTST.name', args: [], assertEql: 'Wrapped Euler Pool: Test Token', },
        { call: 'tokens.weTST.symbol', args: [], assertEql: 'weTST', },
        { call: 'tokens.weTST.decimals', args: [], equals: 18, },
        { call: 'tokens.weTST.eToken', args: [], onResult: async (r) => {
            et.expect(r).to.equal(ctx.contracts.eTokens.eTST.address);
        }, },
    ],
})



.test({
    desc: "weToken to underlying",
    actions: ctx => [
        { call: 'markets.weTokenToUnderlying', args: [ctx.contracts.tokens.weTST.address,], assertEql: ctx.contracts.tokens.TST.address, },
        { call: 'markets.weTokenToUnderlying', args: [ctx.contracts.euler.address,], expectError: 'e/invalid-wetoken', },
    ],
})


.test({
    desc: "config",
    actions: ctx => [
        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.pricingForwarded).to.equal(et.AddressZero);
        }},

        { call: 'markets.getPricingConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r.pricingType).to.equal(5);
            et.expect(r.pricingForwarded).to.equal(ctx.contracts.tokens.TST.address);
        }},

        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            ctx.stash.tstConfig = r;
        } },

        // asset config is inherited from the underlying market
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r.eTokenAddress).to.equal(ctx.contracts.eTokens.eweTST.address);
            et.expect(r.borrowIsolated).to.equal(ctx.stash.tstConfig.borrowIsolated);
            et.expect(r.borrowFactor).to.equal(ctx.stash.tstConfig.borrowFactor);

            et.expect(r.collateralFactor).to.equal(0);
        } },

        { call: 'markets.getOverrideCollaterals', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r).to.deep.equal([ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.weTST.address]);
        } },
        { call: 'markets.getOverrideLiabilities', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r).to.deep.equal([ctx.contracts.tokens.weTST.address]); // self-collateral
        } },
        { call: 'markets.getOverride', args: [ctx.contracts.tokens.weTST.address, ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.enabled).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0.8 * 4e9);
        } },
        { call: 'markets.getOverride', args: [ctx.contracts.tokens.weTST.address, ctx.contracts.tokens.TST2.address], onResult: r => {
            et.expect(r.enabled).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0.5 * 4e9);
        } },
        // self-collateral override
        { call: 'markets.getOverride', args: [ctx.contracts.tokens.weTST.address, ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r.enabled).to.equal(true);
            et.expect(r.collateralFactor).to.equal(0.2 * 4e9);
        } },

        { call: 'wrapperExec.getWETokenReservesConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r[0]).to.equal(ctx.wallet.address);
            et.expect(r[1]).to.equal(0);
        } },

        { call: 'markets.reserveFee', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r).to.equal(0.01 * 4e9);
        } },

        { call: 'markets.interestRateModel', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r).to.equal(2_001_000);
        } },
    ],
})



.test({
    desc: "basic wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 100, },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(101)], expectError: 'e/insufficient-balance', },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(11)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 89, },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 11, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 11, },

        { send: 'tokens.weTST.unwrap', args: [0, et.eth(11.1)], expectError: 'insufficient balance', },
        { send: 'tokens.weTST.claimSurplus', args: [ctx.wallet.address], expectError: 'no surplus balance to claim', },

        { send: 'tokens.weTST.unwrap', args: [0, et.eth(1)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 90, },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 10, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 10, },

        { send: 'eTokens.eweTST.deposit', args: [0, et.eth(5)], },

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
        }, },
    ],
})



.test({
    desc: "arbitrary user can't force unwrap",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(11)], },

        { send: 'tokens.weTST.creditUnwrap', args: [ctx.wallet.address, et.eth(1)], expectError: 'permission denied', },
    ],
})


.test({
    desc: "wrapping from / unwrappnig to sub-accounts",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [1, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [1, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approveSubAccount', args: [1, ctx.contracts.tokens.weTST.address, et.MaxUint256,], },

        { send: 'tokens.weTST.wrap', args: [1, et.eth(5)], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 5, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 5, },

        { send: 'wrapperExec.weTokenWrap', args: [1, ctx.contracts.tokens.weTST.address, et.eth(5)], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 10, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 10, },

        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], equals: 0, },
        { send: 'tokens.weTST.unwrap', args: [2, et.eth(4)], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 6, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], equals: 4, },

        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 3)], equals: 0, },
        { send: 'wrapperExec.weTokenUnWrap', args: [3, ctx.contracts.tokens.weTST.address, et.eth(6)], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 3)], equals: 6, },
    ],
})


.test({
    desc: "wrapping/unwrapping max amount",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },

        { send: 'wrapperExec.weTokenWrap', args: [0, ctx.contracts.tokens.weTST.address, et.MaxUint256], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 10, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 10, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 0, },

        { send: 'wrapperExec.weTokenUnWrap', args: [0, ctx.contracts.tokens.weTST.address, et.MaxUint256], },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 0, },
        { call: 'tokens.weTST.totalSupply', args: [], equals: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 10, },
    ],
})



.test({
    desc: "batch wrapping",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },

        { action: 'sendBatch', batch: [
            { send: 'wrapperExec.weTokenWrap', args: [0, ctx.contracts.tokens.weTST.address, et.eth(11)], },
            { send: 'eTokens.eweTST.deposit', args: [0, et.eth(5)], },
            { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        ]},

        { call: 'exec.detailedLiquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r[0].status.collateralValue, 0);
        }, },
        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet.address], equals: 5, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 89, },

        { action: 'sendBatch', batch: [
            { send: 'eTokens.eweTST.withdraw', args: [0, et.eth(1)], },
            { send: 'wrapperExec.weTokenUnWrap', args: [0, ctx.contracts.tokens.weTST.address, et.eth(1)], },
        ]},

        { call: 'tokens.weTST.balanceOf', args: [ctx.wallet.address], equals: 6, },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet.address], equals: [4, 1e-6], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: 90, },
    ],
})


.test({
    desc: "activating market for wetoken is not allowed",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(11)], },

        { send: 'markets.activateMarket', args: [ctx.contracts.tokens.weTST.address], expectError: 'e/markets/invalid-token', },
        { send: 'wrapperExec.activatePToken', args: [ctx.contracts.tokens.weTST.address], expectError: 'e/ptoken/invalid-underlying', },
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.tokens.weTST.address, defaultConfig(ctx)], expectError: 'e/wetoken/invalid-etoken', },
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eweTST.address, defaultConfig(ctx)], expectError: 'e/nested-wetoken', },
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
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.equals(r.twap, '1.23', '0.0001')
        }},
        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
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
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.equals(r.twap, ctx.stash.twap.mul(ctx.stash.exchangeRate).div(et.c1e18));
        }},
        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
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

        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.equals(r.currPrice, ctx.stash.currPrice.mul(ctx.stash.exchangeRate).div(et.c1e18));
            et.equals(r.currPrice, r.twap);
        }},
    ],
})


.test({
    desc: "activate multiple tokens for a single eToken",
    actions: ctx => [
        { send: 'wrapperExec.activateWEToken', args: [ctx.contracts.eTokens.eTST.address, defaultConfig(ctx)], onLogs: async logs => {
            et.expect(logs[0].args.eToken).to.eq(ctx.contracts.eTokens.eTST.address);
            et.expect(logs[0].args.eToken).to.not.eq(ctx.contracts.tokens.weTST.address);

            ctx.contracts.tokens['weTST_2'] = await ethers.getContractAt('WEToken', logs[0].args.weToken);
        } },
        { call: 'tokens.weTST.eToken', assertEql: ctx.contracts.eTokens.eTST.address, },
        { call: 'tokens.weTST_2.eToken', assertEql: ctx.contracts.eTokens.eTST.address, },
    ],
})


.test({
    desc: "approve / allowance",
    actions: ctx => [
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(10)], },
        { send: 'tokens.weTST.approve', args: [ctx.wallet2.address, et.eth(5)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.tokens.weTST.address);
            et.expect(logs.length).to.equal(1); 
            // Approval event
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet2.address);
            et.assert(logs[0].args.value.eq(et.eth(5)));
        }},

        { from: ctx.wallet2, send: 'tokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(6)], expectError: 'insufficient allowance', },

        { from: ctx.wallet2, send: 'tokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(3)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.tokens.weTST.address);
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

        { call: 'tokens.weTST.allowance', args: [ctx.wallet.address, ctx.wallet2.address], equals: 2, },

        { send: 'tokens.weTST.approve', args: [ctx.wallet2.address, et.eth(10)], },
        {from: ctx.wallet2, send: 'tokens.weTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(10)], expectError: 'insufficient balance', },
    ],
})


.test({
    desc: "wrap non existing wetoken",
    actions: ctx => [
        { send: 'wrapperExec.weTokenWrap', args: [0, ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/wetoken-not-found' },
    ],
})


.test({
    desc: "unwrap non existing wetoken",
    actions: ctx => [
        { send: 'wrapperExec.weTokenUnWrap', args: [0, ctx.contracts.tokens.TST3.address, et.eth(1)], expectError: 'e/exec/wetoken-not-found' },
    ],
})


.test({
    desc: "nested price forwarding",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 3),
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.weTST.address], expectError: 'e/nested-price-forwarding' },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 5),
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.weTST.address], expectError: 'e/nested-price-forwarding' },
    ],
})



.test({
    desc: "set new reserve recipient",
    actions: ctx => [
        { send: 'wrapperExec.setWETokenReserveRecipient', args: [ctx.contracts.euler.address, ctx.wallet2.address], expectError: 'e/invalid-wetoken' },
        { send: 'wrapperExec.setWETokenReserveRecipient', args: [ctx.contracts.tokens.weTST.address, et.AddressZero], expectError: 'e/wetoken/invalid-reserve-recipient' },
        { from: ctx.wallet2, send: 'wrapperExec.setWETokenReserveRecipient', args: [ctx.contracts.tokens.weTST.address, ctx.wallet2.address], expectError: 'e/wetoken/unauthorized' },

        { send: 'wrapperExec.setWETokenReserveRecipient', args: [ctx.contracts.tokens.weTST.address, ctx.wallet2.address] },
        { call: 'wrapperExec.getWETokenReservesConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r[0]).to.equal(ctx.wallet2.address)
        }},
    ],
})



.test({
    desc: "set new dao reserves share",
    actions: ctx => [
        { send: 'governance.setWETokenDaoReserveShare', args: [ctx.contracts.euler.address, 0.4 * 4e9], expectError: 'e/gov/underlying-not-activated' },
        { send: 'governance.setWETokenDaoReserveShare', args: [ctx.contracts.tokens.weTST.address, 4e9 + 1], expectError: 'e/gov/invalid-share' },

        { send: 'governance.setWETokenDaoReserveShare', args: [ctx.contracts.tokens.weTST.address, 0.2 * 4e9] },
        { call: 'wrapperExec.getWETokenReservesConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r[1]).to.equal(0.2 * 4e9)
        }},

        // set back to default
        { send: 'governance.setWETokenDaoReserveShare', args: [ctx.contracts.tokens.weTST.address, 2**32 - 1] },
        { call: 'wrapperExec.getWETokenReservesConfig', args: [ctx.contracts.tokens.weTST.address], onResult: r => {
            et.expect(r[1]).to.equal(0)
        }},
    ],
})



.test({
    desc: "basic liquidity",
    actions: ctx => [
        { from: ctx.wallet3, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'eTokens.eTST3.deposit', args: [0, et.MaxUint256], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '2', },
        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '1.5', },
        { action: 'updateUniswapPrice', pair: 'TST3/WETH', price: '0.5', },


        // wallet1 is depositor
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(10)], },
        { send: 'eTokens.eweTST.deposit', args: [0, et.eth(5)], },

        { call: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r.collateralValue, 0)
            et.equals(r.liabilityValue, 0);
        }, },

        // borrow is not allowed
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(.001)], expectError: 'e/collateral-violation' },
        // self-collateral is allowed
        { send: 'eTokens.eweTST.mint', args: [0, et.eth(1)], },
        { call: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
            et.equals(r.collateralValue, 2.4, 0.001); // 6 * 0.2 (scf) * 2 (price)
            et.equals(r.liabilityValue, 2, 0.001); // 1 / 1 (sbf) * 2 (price)
        }, },

        // wallet2 is borrower

        // TST3 is not an override collateral for weTST
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: 0 }, },
        { from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },

        { from: ctx.wallet2, send: 'dTokens.dweTST.borrow', args: [0, et.eth(0.1)], expectError: 'e/collateral-violation' },
        // But TST3 can be used as regular collateral 
        { action: 'setAssetConfig', tok: 'TST3', config: { collateralFactor: 0.5 }, },
        { from: ctx.wallet2, send: 'dTokens.dweTST.borrow', args: [0, et.eth(0.1)], },
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5, 0.001); // 10 * 0.5 (cf) * 0.5 (price)
            et.equals(r.liabilityValue, 0.714, 0.001); // 0.1 / 0.28 (bf) * 2 (price)
        }, },

        // TST is an override collateral for weTST
        { from: ctx.wallet2, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        // borrow is fully covered by override collateral TST
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5 + 1.6, 0.001); // 1 * 0.8 (ocf) * 2 (price)
            et.equals(r.liabilityValue, 0.2, 0.001); // 0.1 / 1 (obf) * 2 (price)
        }, },

        { from: ctx.wallet2, send: 'dTokens.dweTST.borrow', args: [0, et.eth(0.8)], },
        // additional borrow is partially covered by override collateral TST
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5 + 1.6, 0.001); // 1 * 0.8 (ocf) * 2 (price)
            et.equals(r.liabilityValue, 2.314 , 0.001); // 1.6 (override lv) + (0.9 * 2(price) - 1.6) / 0.28
        }, },

        // TST2 is an override collateral for weTST
        { from: ctx.wallet2, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(3)], },
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5 + 1.6 + 2.25, 0.001); // 3 * 0.5 (ocf) * 1.5 (price)
            et.equals(r.liabilityValue, 1.8 , 0.001); // 0.9 * 2 (price) fully covered by override collateral
        }, },

        // weTST price follows TST price
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '1', },
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5 + 0.8 + 2.25, 0.001);
            et.equals(r.liabilityValue, 0.9 , 0.001);
        }, },

        // weTST price follows eTST exchange rate
        { action: 'setIRM', underlying: 'weTST', irm: 'IRM_ZERO', },

        { from: ctx.wallet3, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { from: ctx.wallet3, send: 'eTokens.eTST.mint', args: [0, et.eth(200)], },

        { action: 'jumpTimeAndMine', time: 900 * 86400, },
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(1)], onResult: r => {
            ctx.stash.exchangeRate = et.formatUnits(r)
        } },
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.collateralValue, 2.5 + 0.8 * ctx.stash.exchangeRate + 2.25, 0.001); 
            et.equals(r.liabilityValue, 0.9 * ctx.stash.exchangeRate , 0.001);
        }, },

        // repay the debt
        { from: ctx.wallet2, send: 'dTokens.dweTST.repay', args: [0, et.MaxUint256], expectError: 'insufficient balance'},
        // a little bit of interest was accrued, need to wrap a bit more
        { from: ctx.wallet2, send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'tokens.weTST.wrap', args: [0, et.eth(.00001)], },
        { from: ctx.wallet2, send: 'dTokens.dweTST.repay', args: [0, et.MaxUint256], },
        { call: 'exec.liquidity', args: [ctx.wallet2.address], onResult: r => {
            et.equals(r.liabilityValue, 0, 0.001);
        }, },
    ],
})



.test({
    desc: "claim / convert reserves",
    actions: ctx => [
        // set dao reserve share
        { send: 'governance.setWETokenDaoReserveShare', args: [ctx.contracts.tokens.weTST.address, 0.2 * 4e9] },
        // set wallet2 as new recipient
        { send: 'wrapperExec.setWETokenReserveRecipient', args: [ctx.contracts.tokens.weTST.address, ctx.wallet2.address] },

        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'eTokens.eTST.deposit', args: [0, et.MaxUint256], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.weTST.address], },
        { send: 'eTokens.eTST.approve', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256,], },
        { send: 'tokens.weTST.wrap', args: [0, et.eth(100)], },
        { send: 'eTokens.eweTST.deposit', args: [0, et.eth(100)], },
        { send: 'governance.setOverride', args: [ctx.contracts.tokens.weTST.address, ctx.contracts.tokens.weTST.address, { enabled: true, collateralFactor: 0.95 * 4e9}], },
        { send: 'eTokens.eweTST.mint', args: [0, et.eth(1000)], },
        { action: 'jumpTimeAndMine', time: 500 * 86400, },

        // reserves accrued
        { call: 'eTokens.eweTST.reserveBalance', equals: [8.61, .01] },
        { call: 'eTokens.eweTST.reserveBalanceUnderlying', equals: [38.37, .01] },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [6.89, .01] }, // 8.61 * (1 - 0.2) dao share = 0.2

        { action: 'snapshot' },

        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet2.address], equals: 0 },

        // recipient claims a part
        { send: 'wrapperExec.claimWETokenReserves', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256], expectError: 'e/unauthorized', },
        { from: ctx.wallet2, send: 'wrapperExec.claimWETokenReserves', args: [ctx.contracts.tokens.weTST.address, et.eth(2)], },

        { call: 'eTokens.eweTST.reserveBalance', equals: [6.61, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet2.address], equals: [2, .01] },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [4.89, .01] },

        // governance claims part
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.weTST.address, ctx.wallet3.address, et.eth(2)], expectError: 'e/gov/insufficient-reserves', },
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.weTST.address, ctx.wallet3.address, et.eth(1)], },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [4.89, .01] },
        { call: 'eTokens.eweTST.reserveBalance', equals: [5.61, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet3.address], equals: [1, .01] },

        // more time elapsed
        { action: 'jumpTimeAndMine', time: 200 * 86400, },
        { call: 'eTokens.eweTST.reserveBalance', equals: [11.33, .01] },

        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [9.46, .01] }, // 4.89 + (11.33 - 5.61) * (1 - 0.2)

        // recipient claims a part
        { from: ctx.wallet2, send: 'wrapperExec.claimWETokenReserves', args: [ctx.contracts.tokens.weTST.address, et.eth(2)], },

        { call: 'eTokens.eweTST.reserveBalance', equals: [9.33, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet2.address], equals: [4, .01] },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [7.46, .01] },

        // governance claims part
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.weTST.address, ctx.wallet3.address, et.eth(1)], },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [7.46, .01] },
        { call: 'eTokens.eweTST.reserveBalance', equals: [8.33, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet3.address], equals: [2, .01] },

        { action: 'snapshot' },
        // recipient claims max
        { from: ctx.wallet2, send: 'wrapperExec.claimWETokenReserves', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256], },
        { call: 'eTokens.eweTST.reserveBalance', equals: [0.87, .01] }, //8.33 - 7.46
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet2.address], equals: [11.46, .01] }, // 4 + 7.46,
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: 0 },

        // governance claims max
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.weTST.address, ctx.wallet3.address, et.MaxUint256], },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [0, .01] },
        { call: 'eTokens.eweTST.reserveBalance', equals: [0, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet3.address], equals: [2.87, .01] },

        // reverse order
        { action: 'revert' },

        // governance claims max
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.weTST.address, ctx.wallet3.address, et.MaxUint256], },
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: [7.46, .01] },
        { call: 'eTokens.eweTST.reserveBalance', equals: [7.46, .01] },
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet3.address], equals: [2.87, .01] },

        // recipient claims max
        { from: ctx.wallet2, send: 'wrapperExec.claimWETokenReserves', args: [ctx.contracts.tokens.weTST.address, et.MaxUint256], },
        { call: 'eTokens.eweTST.reserveBalance', equals: [0, .01] }, //8.33 - 7.46
        { call: 'eTokens.eweTST.balanceOf', args: [ctx.wallet2.address], equals: [11.46, .01] }, // 4 + 7.46,
        { call: 'wrapperExec.getClaimableWETokenReserves', args: [ctx.contracts.tokens.weTST.address], equals: 0 },

        // both parties received their fair share
        () => {
            const totalReservesAccrued = 11.33 + 2 + 1;
            et.equals(11.46, totalReservesAccrued * (1 - 0.2), 0.01); // recipient final balance
            et.equals(2.87, totalReservesAccrued * 0.2, 0.01); // dao final balance
        },
    ],
})

.run();
