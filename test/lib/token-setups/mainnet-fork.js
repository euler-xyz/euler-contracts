module.exports = {
    riskManagerSettings: {
        referenceAsset: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        uniswapPoolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
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
                permit: {
                    type: "EIP2612",
                    domain: {
                        name: "USD Coin",
                        version: "2",
                        chainId: 1,
                        verifyingContract: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
                    },
                },
            },
            DAI: {
                address: '0x6b175474e89094c44da98b954eedeac495271d0f',
                permit: {
                    type: "Allowed",
                    domain: {
                        name: "Dai Stablecoin",
                        version: "1",
                        chainId: 1,
                        verifyingContract: "0x6b175474e89094c44da98b954eedeac495271d0f",
                    },
                },
            },
            GRT: {
                address: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
                permit: {
                    type: 'EIP2612',
                    domain: {
                        name: "Graph Token",
                        version: "0",
                        chainId: 1,
                        verifyingContract: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
                        salt: '0x51f3d585afe6dfeb2af01bba0889a36c1db03beec88c6a4d0c53817069026afa',
                    },
                },
            },
            YVBOOST: {
                address: '0x9d409a0a012cfba9b15f6d4b36ac57a46966ab9a',
                permit: {
                    type: "Packed",
                    domain: {
                        name: "Yearn Vault",
                        version: "0.3.5",
                        chainId: 1,
                        verifyingContract: "0x9d409a0a012cfba9b15f6d4b36ac57a46966ab9a",
                    },
                },
            },
        },

        uniswapPools: [],

        activated: [
            "BAT",
            "RGT",
            "USDT",
            "USDC",
            "DAI",
            "GRT",
            "YVBOOST",
        ],
    },
};

