# Smart contract deployments and verification

This document provides a guide for the deployment and verification of the smart contracts.


## Smart contract deployment

module.exports = {
    riskManagerSettings: {},

    testing: {
        tokens: [],
        uniswapPools: [],
        activated: [],
        chainlinkPrices: {},
        chainlinkOracles: [],
    },    
}

deploys contracts 

spits out two files for evm and zkSync
addresses file
constructor arguments file for hardhat verification and in the case of zkSync for verification on their explorer as well.

populate the price oracle property if ....

copy addresses file to addresses directory (and rename network name if input file has different name)
add token addresses to token setups named after network name in hardhat and env


## Smart contract verification 

add flag 
hardhat verification is supported on the following networks in deploy-lib:
* 
* 
* 

ensure env variable is set with correct api key for the chain explorer, e.g., etherscan, bscscan, polygonscan 
this will do automatic verification using this command from hardhat docs 
https://hardhat.org/hardhat-runner/plugins/nomiclabs-hardhat-etherscan


output file for verification has the path to the smart contract and constructor arguments

or user can do manual verification for any that fails

there is also hardhat task that can be used for verification