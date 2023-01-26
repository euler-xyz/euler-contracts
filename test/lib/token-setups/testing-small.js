module.exports = {
    testing: {
        tokens: [
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                },
            },
            {
                name: "Test Token",
                symbol: "TST",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                },
            },
            {
                name: "Test Token 2",
                symbol: "TST2",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                },
            },
            {
                name: "Euler Token",
                symbol: "EUL",
                decimals: 18,
            },
        ],

        uniswapPools: [
            ["TST", "WETH"],
        ],

        activated: [
            "WETH",
            "TST",
            "TST2",
        ],

        chainlinkPrices: {
            TST2: 1
        },

        chainlinkOracles: [
            "TST2",
        ]

        // useRealUniswap: true,
    },
};