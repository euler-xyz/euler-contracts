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
        ],

        useRealUniswap: true,

        uniswapPools: [
            ["TST", "WETH"],
            ["TST2", "WETH"],
        ],

        activated: [
            "WETH",
            "TST",
            "TST2",
        ],
    },
};
