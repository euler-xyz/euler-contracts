const fs = require("fs");
require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("solidity-coverage");
require('custom-env').env()


// Load tasks

const files = fs.readdirSync('./tasks');

for (let file of files) {
    if (!file.endsWith('.js')) continue;
    require(`./tasks/${file}`);
}


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
                version: "0.8.7",
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

for (i in process.env) {
    if (i.startsWith("RPC_URL_")) {
        let networkName = i.slice(i.lastIndexOf("_") + 1,)
        module.exports.networks = {
            [networkName.toLowerCase()]: {
                url: `${process.env[i]}`,
                accounts: [`0x${process.env.PRIVATE_KEY}`],
            }
        }
    }
}
