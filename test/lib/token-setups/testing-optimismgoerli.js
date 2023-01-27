module.exports = {
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
                name: "Dai Stablecoin",
                symbol: "DAI",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                },
            },
            {
                name: "Curve DAO Token",
                symbol: "CRV",
                decimals: 18,
                config: {
                    collateralFactor: 0,
                    borrowFactor: 0.7,
                    borrowIsolated: true,
                },
            },
            {
                name: "PieDAO DOUGH v2",
                symbol: "DOUGH",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowFactor: 0.8,
                    borrowIsolated: true,
                },
            },
            {
                name: "Reputation",
                symbol: "REP",
                decimals: 18,
                config: {
                    collateralFactor: 0,
                    borrowFactor: 0.76,
                    borrowIsolated: false,
                },
            },
            {
                name: "Uniswap",
                symbol: "UNI",
                decimals: 18,
                config: {
                    collateralFactor: 0,
                    borrowFactor: 0.76,
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
                name: "Wrapped BTC",
                symbol: "WBTC",
                decimals: 8,
                config: {
                    collateralFactor: 0.88,
                    borrowFactor: 0.91,
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
        ],

        uniswapPools: [
        ],

        activated: [
            "WETH",
            "EUL",
            "DAI",
            "COMP",
            "USDC",
            "USDT",
            "WBTC",
            "UNI",
            "REP",
            "DOUGH",
            "CRV",
            "BZRX"
        ],

        chainlinkPrices: {
            EUL: 0.0031974695,
            DAI: 0.000612,
            COMP: 0.031852903127343,
            USDC: 0.00061877505779954,
            USDT: 0.00062015328626584,
            WBTC: 14.28179057601,
            UNI: 0.0040750209099273,
            REP: 0.0036645044321926,
            DOUGH: 0.000039997821658434,
            CRV: 0.0006578577613505,
            BZRX: 0.000024967004612911,
        },

        chainlinkOracles: [
            "EUL",
            "DAI",
            "COMP",
            "USDC",
            "USDT",
            "WBTC",
            "UNI",
            "REP",
            "DOUGH",
            "CRV",
            "BZRX"
        ]
    },
};