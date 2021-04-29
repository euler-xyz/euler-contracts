require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("solidity-coverage");
require('dotenv').config();

module.exports = {
    networks: {
        kovan: {
            url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
            gasPrice: 3000000000
        },
        ropsten: {
            url: `https://eth-ropsten.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
            gasPrice: 23000000000
        },
        goerli: {
            url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY_GOERLI}`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
            gasPrice: 23000000000
        },
        hardhat: {
            hardfork: 'berlin',
        },
    },

    solidity: {
        compilers: [
            {
                version: "0.8.3",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000000,
                    },
                    outputSelection: {
                        "contracts/Storage.sol": {
                            "*": [
                              "storageLayout",
                            ],
                        },
                        //"contracts/modules/DToken.sol": {
                        //    "*": [
                        //      "evm.assembly",
                        //    ],
                        //}
                    }
                },
            },
        ],
    },

    contractSizer: {
        //runOnCompile: true,
    },
};
