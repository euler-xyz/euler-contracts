module.exports = {
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
            },
        },
        {
            name: "Test Token 3",
            symbol: "TST3",
            decimals: 18,
        },
        {
            name: "Test Token 4",
            symbol: "TST4",
            decimals: 18,
        },
        {
            name: "Test Token 5",
            symbol: "TST5",
            decimals: 18,
        },
        {
            name: "Test Token 6",
            symbol: "TST6",
            decimals: 18,
        },
        {
            name: "Test Token 7",
            symbol: "TST7",
            decimals: 18,
        },
        {
            name: "Test Token 8",
            symbol: "TST8",
            decimals: 18,
        },
        {
            name: "Test Token 9",
            symbol: "TST9",
            decimals: 6,
        },
        {
            name: "Test Token 10",
            symbol: "TST10",
            decimals: 18,
        },
        {
            name: "Unactivated Test Token",
            symbol: "UTST",
            decimals: 18,
        },
    ],

    uniswapPools: [
        ["TST", "WETH"],
        ["TST2", "WETH"],
        ["TST3", "WETH"],
        ["TST6", "WETH"],
        ["TST9", "WETH"],
        ["UTST", "WETH"],
    ],

    activated: [
        "WETH",
        "TST",
        "TST2",
        "TST3",
        "TST6", // TST6 address is the first one < the WETH address which exercises uniswap's address sorting
        "TST9", // Has different decimals
    ],
};
