const fs = require("fs");
require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();
require("@nomiclabs/hardhat-etherscan");


// Config

module.exports = {
    
    networks: {
        hardhat: {
            hardfork: 'berlin',
        },
    },

    solidity: {
        compilers: [
            {
                version: "0.8.4",
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

    etherscan: {
        // Your API key for Etherscan
        // Obtain one at https://etherscan.io/
        apiKey: "YWGA9IG8T37IZ5JX4UKKNNF8E3W8XKGCD1"
    },

};


if (process.env.PRIVATE_KEY && process.env.ALCHEMY_API_KEY) {
    module.exports.networks = {
        ...module.exports.networks,

        kovan: {
            url: `https://eth-kovan.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
        },
        ropsten: {
            url: `https://${process.env.ALCHEMY_API_KEY}.ropsten.rpc.rivet.cloud/`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
        },
        goerli: {
            url: `https://eth-goerli.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
            accounts: [`0x${process.env.PRIVATE_KEY}`],
        },
    };
}
