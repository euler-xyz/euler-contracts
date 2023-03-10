module.exports = {
    riskManagerSettings: {
        referenceAsset: '0x0000000000000000000000000000000000000001',
        uniswapFactory: '0x0000000000000000000000000000000000000000',
    },

    testing: {
        tokens: [
            {
                name: "Euler",
                symbol: "EUL",
                decimals: 18,
                config: {
                    collateralFactor: 0,
                    borrowFactor: 0.25,
                    borrowIsolated: true,
                },
            },
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
                config: {
                    collateralFactor: 0.85,
                    borrowFactor: 0.8,
                    borrowIsolated: false,
                },
            },
            {
                name: "Tether USD",
                symbol: "USDT",
                decimals: 6,
                config: {
                    collateralFactor: 0.9,
                    borrowFactor: 0.94,
                    borrowIsolated: false,
                },
            },
            {
                name: "USD Coin",
                symbol: "USDC",
                decimals: 6,
                config: {
                    collateralFactor: 0.9,
                    borrowFactor: 0.94,
                    borrowIsolated: false,
                },
            },
            {
                name: "Compound",
                symbol: "COMP",
                decimals: 18,
                config: {
                    collateralFactor: 0,
                    borrowFactor: 0.7,
                    borrowIsolated: true,
                },
            },
            {
                name: "Wrapped BTC",
                symbol: "WBTC",
                decimals: 8,
                config: {
                    collateralFactor: 0.88,
                    borrowFactor: 0.91,
                    borrowIsolated: false,
                },
            },
        ],

        uniswapPools: [
            // ["USDC", "WETH"],
        ],

        activated: [
            "WETH",
            "EUL",
            "USDT",
            "USDC",
            "COMP",
            "WBTC",
        ],

        chainlinkOracles: [
            "WETH",
            "EUL",
            "USDT",
            "USDC",
            "COMP",
            "WBTC",
        ],

        chainlinkPrices: {
            WETH: 1,
            EUL: 0.0031974695,
            USDT: 0.00062015328626584,
            USDC: 0.00061877505779954,
            COMP: 0.031852903127343,
            WBTC: 14.28179057601,
        },
    },
};