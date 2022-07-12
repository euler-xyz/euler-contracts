module.exports = {
    // could have all three
    // constructor args for each contract in output json file?

    // goerli
    // riskManagerSettings: {
    //     referenceAsset: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    //     uniswapFactory: '0x288be1A33bcdfA9A09cCa95CA1eD628A5294e82c',
    //     uniswapPoolInitCodeHash: '0xc02f72e8ae5e68802e6d893d58ddfb0df89a2f4c9c2f04927db1186a29373660',
    // },
    // mainnet
    // existingContracts: {
    //     swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    //     oneInch: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
    //     eulToken: '0xd9fcd98c322942075a5c3860693e9f4f03aae07b',
    // },
    // goerli
    existingTokens: {
        DAI: {
            address: '0x848840e2d0bcb5c6ce530de671ef97fd64bea6db',
        },
        USDC: {
            address: '0x94b348EdFE1f989Fc7a49CF058DE47A60746Ae43',
        },
        USDT: {
            address: '0x86358D04992019356e893DCe2Ab31DFDc61c83A4',
        },
        WBTC: {
            address: '0x25c2ad80e2213434d161B4e1648dF9A6D356157A',
        },
        UNI: {
            address: '0x1675E1Da3c621AF02102cdE23d70ba7D49Df94d2',
        },
        COMP: {
            address: '0xf806E9732D2ab949B493E47Df4b8180A47fa13eb',
        },
        REP: {
            address: '0x104114b31a9e93C55645F1E5D54FD370b388fB66',
        },
        BZRX: {
            address: '0x4Ab905A0E1AdC9D9Dba66668b812D749DEA3620d',
        },
        DOUGH: {
            address: '0xb1222EFBA63F8C64cff04970749c266b5c6646D4',
        },
        CRV: {
            address: '0x83700f43C9Cf7cf6A1714641e6EB02c848BaaD77',
        },
    },

    contracts: ['Governance', 'EulerSimpleLens'],
    modules: ['governance'],
    testing: {
        tokens: [
            {
                name: "Wrapped ETH",
                symbol: "WETH",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                    price: 1
                },
               
            },
            {
                name: "Test Token",
                symbol: "TST",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    borrowIsolated: false,
                    pricingType: 2, // uniswap twap
                    price: 0.008
                },
                
            },
            {
                name: "Test Token 2",
                symbol: "TST2",
                decimals: 18,
                config: {
                    collateralFactor: 0.75,
                    pricingType: 4, // chainlink
                    price: 0.003
                },
                
            },
        ],

        uniswapPools: [
            ["TST", "WETH"],
            ["TST2", "WETH"],
        ],

        useRealUniswap: true,

        activated: [
            "WETH",
            "TST",
            "TST2"
        ]
    }
};
