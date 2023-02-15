const fs = require("fs");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");
require('hardhat-gas-reporter');
require("solidity-coverage");


// Load tasks

const files = fs.readdirSync('./tasks');

for (let file of files) {
    if (!file.endsWith('.js')) continue;
    require(`./tasks/${file}`);
}


// Config

module.exports = {
    // zksync config
    zksolc: {
        version: "1.3.1",
        compilerSource: "binary",
        settings: {},
    },
    networks: {
        hardhat: {
            hardfork: 'arrowGlacier',
            chainId: 1,
        },
        localhost: {
            chainId: 1,
            url: "http://127.0.0.1:8545",
            timeout: 5 * 60 * 1000, 
        },
    },

    solidity: {
        compilers: [
            {
                version: "0.8.10",
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
                    },
                },
            },
        ],
    },

    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
    },

    contractSizer: {
        //runOnCompile: true,
    },

    etherscan: {
        apiKey: {},
    },

    mocha: {
        timeout: 100000
    },

    etherscan: {
        apiKey: {},
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
            ...module.exports.networks,
            [networkName]: {
                url: `${process.env[k]}`,
                accounts: [`0x${process.env.PRIVATE_KEY}`],
            }
        }

        if (networkName === "zktestnet" && process.env.RPC_URL_GOERLI) {
            // zksync config
            require("@matterlabs/hardhat-zksync-deploy");
            require("@matterlabs/hardhat-zksync-solc");

            module.exports.networks = {
                ...module.exports.networks,
                [networkName]: {
                    url: `${process.env[k]}`,
                    ethNetwork: `${process.env.RPC_URL_GOERLI}`,
                    zksync: true,
                }
            }

            module.exports.zkSyncDeploy = {
                zkSyncNetwork: `${process.env[k]}`,
                ethNetwork: `${process.env.RPC_URL_GOERLI}`
            }
        }
    }

    if (k === "ETHERSCAN_API_KEY") {
        module.exports.etherscan.apiKey.mainnet = process.env[k];
        module.exports.etherscan.apiKey.goerli = process.env[k];
    }

    if (k === "POLYGONSCAN_API_KEY") {
        module.exports.etherscan.apiKey.polygon = process.env[k];
        module.exports.etherscan.apiKey.polygonMumbai = process.env[k];
    }

    if (k === "BSCSCAN_API_KEY") {
        module.exports.etherscan.apiKey.bsc = process.env[k];
        module.exports.etherscan.apiKey.bscTestnet = process.env[k];
    }

    if (k === "OPTIMISMSCAN_API_KEY") {
        module.exports.etherscan.apiKey.optimisticEthereum = process.env[k];
        module.exports.etherscan.apiKey.optimisticGoerli = process.env[k];
    }
}
