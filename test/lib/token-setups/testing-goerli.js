module.exports = {
    testing: {
        tokens: [
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
                config: {
                    price: 1
                },

            },
            {
                name: "Uniswap",
                symbol: "UNI",
                decimals: 18,
                config: {
                    pricingType: 4,
                    price: 0.004657
                },

            },
            {
                name: "USD Coin",
                symbol: "USDC",
                decimals: 6,
                config: {
                    pricingType: 4,
                    price: 0.000624
                },

            },
            {
                name: "Tether USD",
                symbol: "USDT",
                decimals: 6,
                config: {
                    pricingType: 4,
                    price: 0.000624
                },

            },
            {
                name: "Dogecoin",
                symbol: "DOGE",
                decimals: 8,
                config: {
                    pricingType: 4,
                    price: 0.000046
                },

            },
            {
                name: "Wrapped BTC",
                symbol: "WBTC",
                decimals: 8,
                config: {
                    pricingType: 4,
                    price: 14.70
                },

            },
            {
                name: "Compound",
                symbol: "COMP",
                decimals: 18,
                config: {
                    pricingType: 4,
                    price: 0.037368
                },

            },
            {
                name: "Curve DAO Token",
                symbol: "CRV",
                decimals: 18,
                config: {
                    pricingType: 4,
                    price: 0.000779
                },

            },
        ],

        useRealUniswap: true,

        uniswapPools: [
            ["UNI", "WETH"],
            ["USDC", "WETH"],
            ["USDT", "WETH"],
            ["DOGE", "WETH"],
            ["WBTC", "WETH"],
            ["COMP", "WETH"],
            ["CRV", "WETH"],
        ],

        activated: [
            "WETH",
            "UNI",
            "USDC",
            "USDT",
            "DOGE",
            "WBTC",
            "COMP",
            "CRV"
        ]
    }
};
