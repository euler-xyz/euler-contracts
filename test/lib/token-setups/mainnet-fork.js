module.exports = {
    riskManagerSettings: {
        referenceAsset: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        uniswapPoolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54', // '0xc02f72e8ae5e68802e6d893d58ddfb0df89a2f4c9c2f04927db1186a29373660',
    },

    existingContracts: {
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        oneInch: '0x11111112542d85b3ef69ae05771c2dccff4faa26',
    },

    testing: {
        forkTokens: {
            DAI: {
                address: '0x6b175474e89094c44da98b954eedeac495271d0f',
            },
            CVP: {
                address: '0x38e4adb44ef08f22f5b5b76a8f0c2d0dcbe7dca1',
            },
            USDC: {
                address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            },
            UNI: {
                address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
            },
        },

        uniswapPools: [],

        activated: [
            "DAI",
            "CVP",
            "USDC",
            "UNI",
        ],
    },
};

