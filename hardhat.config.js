const fs = require("fs");
require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("solidity-coverage");


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


if (process.env.NODE_ENV) {
    let path = `.env.${process.env.NODE_ENV}`;
    if (!fs.existsSync(path)) throw(`unable to open env file: ${path}`);
    require("dotenv").config({ path, });
} else if (fs.existsSync('./.env')) {
    require("dotenv").config();
}

for (let k in process.env) {
    if (k.startsWith("RPC_URL_")) {
        let networkName = k.slice(8).toLowerCase();

        module.exports.networks = {
            [networkName]: {
                url: `${process.env[k]}`,
                accounts: [`0x${process.env.PRIVATE_KEY}`],
            }
        }
    }
}
