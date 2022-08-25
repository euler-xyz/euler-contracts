module.exports = {
    riskManagerSettings: {
        referenceAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        uniswapFactory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        uniswapPoolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },

    existingContracts: {
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        oneInch: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
        eulToken: '0xd9fcd98c322942075a5c3860693e9f4f03aae07b',
        chainlinkAggregator_STETH_ETH: '0x86392dc19c0b719886221c78ab11eb8cf5c52812',
        chainlinkAggregator_ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
        chainlinkAggregator_MATIC_USD: '0x7bAC85A8a13A4BcD8abb3eB7d6b4d632c5a57676',
        chainlinkAggregator_ENS_USD: '0x5C00128d4d1c2F4f652C267d7bcdD7aC99C16E16',
    },

    existingTokens: {
        WETH: {
            address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        },
        USDC: {
            address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        },
        DAI: {
            address: '0x6b175474e89094c44da98b954eedeac495271d0f',
        },
        STETH: {
            address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
        },
    },
};
