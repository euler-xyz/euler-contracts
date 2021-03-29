module.exports = {
    tokens: [
        {
            name: "Wrapped ETH",
            symbol: "WETH",
            decimals: 18,
        },
        {
            name: "DAI",
            symbol: "DAI",
            decimals: 18,
        },
        {
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
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
        },
    ],

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
    ],
};
