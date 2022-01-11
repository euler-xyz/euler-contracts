module.exports = {
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
                decimals: 6,
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
            {
                name: "Euler Token",
                symbol: "EUL",
                decimals: 18,
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
