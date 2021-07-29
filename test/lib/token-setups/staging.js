module.exports = {
    riskManagerSettings: {
        referenceAsset: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        uniswapFactory: '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6',
        uniswapPoolInitCodeHash: '0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54',
    },

    testing: {
        tokens: [
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
                config: {
                    collateralFactor: 0.9,
                    borrowIsolated: false,
                },
            },
            {
                name: "DAI",
                symbol: "DAI",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                },
            },
            {
                name: "USD Coin",
                symbol: "USDC",
                decimals: 18,
                config: {
                    collateralFactor: 0.85,
                    borrowIsolated: false,
                },
            },
            {
                name: "Basic Attention Token",
                symbol: "BAT",
                decimals: 18,
            },
            {
                name: "Chainlink",
                symbol: "LINK",
                decimals: 18,
            },
            {
                name: "Uniswap Token",
                symbol: "UNI",
                decimals: 18,
                config: {
                    borrowIsolated: false,
                },
            },
            {
                name: "yearn.finance",
                symbol: "YFI",
                decimals: 18,
            },
            {
                name: "Compound",
                symbol: "COMP",
                decimals: 18,
                config: {
                    collateralFactor: 0.5,
                    borrowIsolated: false,
                },
            },
        ],

        useRealUniswap: true,

        uniswapPools: [
            ["DAI", "WETH"],
            ["USDC", "WETH"],
            ["BAT", "WETH"],
            ["LINK", "WETH"],
            ["UNI", "WETH"],
            ["YFI", "WETH"],
            ["COMP", "WETH"],
        ],

        activated: [
            "WETH",
            "DAI",
            "USDC",
            "BAT",
            "LINK",
            "UNI",
            "YFI",
            "COMP",
        ],
    },
};
