const et = require('./lib/eTestLib');

et.testSet({
    desc: "twap handling",
})


.test({
    desc: "prices round-trip",
    actions: ctx => [
        { action: 'cb', cb: async () => {
            // Make sure we exercise both directions

            let wethAddr = ethers.BigNumber.from(ctx.contracts.tokens.WETH.address);
            let tstAddr = ethers.BigNumber.from(ctx.contracts.tokens.TST.address);
            let tst6Addr = ethers.BigNumber.from(ctx.contracts.tokens.TST6.address);

            et.assert(wethAddr.lt(tstAddr), "weth < tst");
            et.assert(wethAddr.gt(tst6Addr), "weth > tst6");
        }},

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '20', },
        { action: 'getPrice', underlying: 'TST', onResult: r => et.equals(r.twap, 20, 0.01), },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '21', },
        { action: 'getPrice', underlying: 'TST', onResult: r => et.equals(r.twap, 21, 0.01), },

        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '0.03', },
        { action: 'getPrice', underlying: 'TST2', onResult: r => et.equals(r.twap, 0.03, '0.00001'), },

        { action: 'updateUniswapPrice', pair: 'TST6/WETH', price: '0.000021333', },
        { action: 'getPrice', underlying: 'TST6', onResult: r => et.equals(r.twap, '0.000021333', '0.000000001'), },

        { action: 'updateUniswapPrice', pair: 'TST6/WETH', price: '1.3242', },
        { action: 'getPrice', underlying: 'TST6', onResult: r => et.equals(r.twap, 1.3242, 0.001), },

        // unchanged from above
        { action: 'getPrice', underlying: 'TST', onResult: r => et.equals(r.twap, 21, 0.01), },

        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '0.0000329', },
        { action: 'getPrice', underlying: 'TST', onResult: r => et.equals(r.twap, '0.0000329', '0.0000001'), },
    ],
})


.test({
    desc: "no uniswap configured",
    actions: ctx => [
        { action: 'cb', cb: async () => {
            // Install RiskManager without uniswap configured
            const riskManagerSettings = {
                referenceAsset: ctx.contracts.tokens['WETH'].address,
                uniswapFactory: ethers.constants.AddressZero,
                uniswapPoolInitCodeHash: et.ethers.utils.hexZeroPad('0x', 32),
            }

            ctx.contracts.modules.riskManager = await (await ctx.factories.RiskManager.deploy(
                et.ethers.utils.hexZeroPad('0x', 32),
                riskManagerSettings
            )).deployed()
            
            await (await ctx.contracts.installer.connect(ctx.wallet)
                .installModules([ctx.contracts.modules.riskManager.address])).wait();
        }},

        { action: 'getPrice', underlying: 'TST', expectError: 'e/unable-to-get-the-price', },
        { action: 'getPrice', underlying: 'TST2', expectError: 'e/unable-to-get-the-price', },
    ],
})


.run();
