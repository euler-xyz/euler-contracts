module.exports = {
    riskManagerSettings: {
        referenceAsset: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        uniswapPoolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54', // '0xc02f72e8ae5e68802e6d893d58ddfb0df89a2f4c9c2f04927db1186a29373660',
    },

    existingContracts: {
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        oneInch: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
    },

    testing: {
        forkTokens: {
            BAT: {
                address: '0x0d8775f648430679a709e98d2b0cb6250d2887ef',
            },
            RGT: {
                address: '0xd291e7a03283640fdc51b121ac401383a46cc623',
            },
            USDT: {
                address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
            },
            USDC: {
                address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            },
        },

        uniswapPools: [],

        activated: [
            "BAT",
            "RGT",
            "USDT",
            "USDC",
        ],
    },
};

