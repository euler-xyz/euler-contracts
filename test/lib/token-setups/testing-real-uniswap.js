module.exports = {
    testing: {
        tokens: [
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
            },
            {
                name: "Test Token",
                symbol: "TST",
                decimals: 18,
            },
        ],

        useRealUniswap: true,

        uniswapPools: [
            ["TST", "WETH"],
        ],

        activated: [
        ],
    },
};
