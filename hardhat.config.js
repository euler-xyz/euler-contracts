require("@nomiclabs/hardhat-waffle");
require("hardhat-contract-sizer");
require("solidity-coverage");

const ALCHEMY_API_KEY = "34UwtRY3r42lEjQMX-E_PqWvbo1KLWdA";
const KOVAN_PRIVATE_KEY = "c13432930aa9654f4f04ec6d1581d1ec2b62ca3099ce35d5d2f985d9874d6f40";
// const KOVAN_ACCOUNT = '0x71e48c397a37597D9813Ef1E11c60F4c5528E3de';
// deployment docs: https://hardhat.org/tutorial/deploying-to-a-live-network.html

module.exports = {
    networks: {
        kovan: {
            url: `https://eth-kovan.alchemyapi.io/v2/${ALCHEMY_API_KEY}`,
            accounts: [`0x${KOVAN_PRIVATE_KEY}`],
            gasPrice: 3000000000
        }
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
