## Smart contract deployment and etherscan verification

In order to perform verification on etherscan, the an etherscan api key variable is required in the `.env` file:

    ETHERSCAN_API_KEY=YWGA9IG8...


## Deployment

The following hardhat task deploys and verifies all the required smart contracts as well as additional test tokens and their configurations on the testnet given the test token symbols and expected testnet configurations:

    npx hardhat deploy:new-network <input fileName> --network <networkName>

The `networkName` parameter could be for example mainnet, or goerli. 

The input file is a JavaScript file (stored under `test/lib/token-setups`) containing the following objects:

`riskManagerSettings` - object containing reference asset (WETH) address for Uniswap V3, the Uniswap Factory contract address on the network and the Uniswap Pool Init Code Hash for the network. This parameter is optional for testnets. If this parameter is not specified, the task will use the test WETH token address as the reference asset and the deployed uniswap factory contract in place of the uniswapFactory property.

    riskManagerSettings: {
        referenceAsset: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
        uniswapFactory: '0x288be1A33bcdfA9A09cCa95CA1eD628A5294e82c',
        uniswapPoolInitCodeHash: '0xc02f72e8ae5e68802e6d893d58ddfb0df89a2f4c9c2f04927db1186a29373660',
    },

`existingContracts` - object containing the swap router smart contract address, oneInch contract address and Euler token contract address for setting up the liquidity mining smart contract.

    existingContracts: {
        swapRouter: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        oneInch: '0x1111111254fb6c44bAC0beD2854e76F90643097d',
        eulToken: '0xd9fcd98c322942075a5c3860693e9f4f03aae07b',
    },

`testing` - object containing test net tokens and their configurations. The hardhat task will deploy each of the specified tokens to the testnet and if the pricingType is equal to 4 (chainlink pricing type), it will deploy a chainlink ETH price oracle for the asset, switch its pricing configuration to chainlink, setup its chainlink oracle contract address and set the initial price to the specified price in ETH. 
For all tokens, the task will also set their asset configurations calling the `setAssetConfig()` function in the `governance` module.

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
                        pricingType: 2, // uniswap pricing type
                        price: 0.008
                    },
                    
                },
                {
                    name: "Test Token 2",
                    symbol: "TST2",
                    decimals: 18,
                    config: {
                        collateralFactor: 0.75,
                        borrowIsolated: false,
                        pricingType: 4, // chainlink pricing type
                        price: 0.008
                    },
                    
                },
            ]
    } 

`uniswapPools` - an array within the testing object above, specifying which test token uniswap pools to create. The pools will be created for pairs of deployed test token and test WETH.
    testing: {
        uniswapPools: [
            ["TST", "WETH"],
        ],
    }

`useRealUniswap` - if set to true e.g., `useRealUniswap: true`, the task will deploy the uniswapV3Factory and SwapRouterFactory contracts on the testnet. Otherwise it will deploy a mock MockUniswapV3Factory to the testnet.

    testing {
        useRealUniswap: true
    }

`activated` - this is an array contaiing token symbols for test markets to be activated. For each token symbol in this array, the hardhat task will Initializing uniswap pools for tokens to activate as well as activate their markets via the markets module and setup their asset configurations.
    testing {
        activated: [
            "WETH",
            "TST",
        ]
    }
    


The output file is saved in the `addresses` folder and named after network name, e.g., `addresses/euler-addresses-${networkName}.json`.


## Updating deployments

In addition to the task for a fresh deployment, there is also a task which can be used to update the deployment i.e., to update the deployed contracts (or modules) or update deployed test tokens.

    npx hardhat deploy:update-network <input fileName> --network <networkName>

It requires a similar input file, with the following additional parameter:
`contracts` - an array of contract names according to their names within the smart contract files. e.g., `contracts: ['Governance', 'EulerSimpleLens']`. For those that are modules, it will also re-install them after deployment on the testnet assuming the deployer wallet is the current installer admin. Configuring the deployed tokens/markets also assumes the deployer is the governor admin on the testnet. 
If `RiskManager` is one of the contracts to update, the `riskManagerSettings` object will be required in the input file. If `Swap` is one of the contracts to update, the `existingContracts` object will be required.

The script will log the new contract addresses to the console. Check they're deployed as expected and replace the contract/module addresses in the relevant network addresses file in the `addresses/` directory.