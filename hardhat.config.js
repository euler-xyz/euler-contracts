const fs = require("fs");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-contract-sizer");
require('hardhat-gas-reporter');
require("solidity-coverage");
// zksync config
require("@matterlabs/hardhat-zksync-deploy");
require("@matterlabs/hardhat-zksync-solc");

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
        version: "1.2.0",
        compilerSource: "binary",
        settings: {
          experimental: {
            dockerImage: "matterlabs/zksolc",
            tag: "v1.2.0",
          },
        },
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
    }
};


if (process.env.NODE_ENV) {
    let path = `.env.${process.env.NODE_ENV}`;
    if (!fs.existsSync(path)) throw(`unable to open env file: ${path}`);
    require("dotenv").config({ path, });
} else if (fs.existsSync('./.env')) {
    require("dotenv").config();
}

for (let k in process.env) {
    if (k === "ZKSYNC_HARDHAT") {
        // zksync config
        const zksync = process.env[k].toLowerCase() === "true"? true : false;
        module.exports.networks.hardhat.zksync = zksync;
    }

    if (k.startsWith("RPC_URL_")) {
        let networkName = k.slice(8).toLowerCase();

        module.exports.networks = {
            ...module.exports.networks,
            [networkName]: {
                url: `${process.env[k]}`,
                accounts: [`0x${process.env.PRIVATE_KEY}`],
            }
        }

        if (networkName === "goerli") {
            // zksync config
            module.exports.zkSyncDeploy = {
                zkSyncNetwork: "https://zksync2-testnet.zksync.dev",
                ethNetwork: `${process.env[k]}`
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
}
