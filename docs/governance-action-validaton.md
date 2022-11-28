# Governance action validation

## Overview

Before performing an on-chain governnace action on the mainnet, it is usually required to have an understanding of how the governance action will affect users, e.g., will changing the collateral or borrow factors of an asset affect users or put their health score at risk causing them to be in violation / at risk of liquidation and if so, to what degree? another example is understanding the effect of changing a pricing type for an asset or market from UNISWAP3_TWAP to CHAINLINK.

We can perform governance action simulations based on the already deployed smart contracts and users on the mainnet. However, to accomplish this, we will also need to impersonate the current mainnet governor admin to enable us call setter functions in the Governance module.


## Steps

The proposed steps to validate on-chain governance actions are as follows:

### 1. Launch hardhat node (i.e., localhost network)
We will be using an instance of the local hardhat network to fork the mainnet. This means that it will simulate having the same state as mainnet, but it will work as a local development network. That way we can interact with deployed protocols on the mainnet and test complex interactions locally.

Run the following command:
    `npx hardhat node`

### 2. Fork the mainnet from a specific block number
Within the debug hardhat task file i.e., `tasks/debug.js` we have a task `debug:fork` which we can use to fork the mainnet at a specific block number.
The localhost network from step 1 must be running before this step.

Run the following command in a new tab with the latest block number:
    `npx hardhat --network localhost debug:fork --block 15990114`

### 3. Extract all unique user wallet addresses, health scores and violation status

For all the addresses that have entered a market based on logs from the `EnterMarket` event in `BaseLogic.sol`, we want to extract the address, the health score of the address which will be used to determine whether or not the address is in violation or at risk of liquidation.

Run the following command:
    `npx hardhat --network localhost gov:forkAccountsAndHealthScores <fileName>`

Note: the `fileName` parameter is needed to store the extracted data in a `.json` file in the project root folder for a later action, i.e., doing a difference check of the health scores before and after the governance action.
This file can be deleted later on in step 6 if not required.

### 4. Perform a governance action on the mainnet fork

The available actions can be found in the file `tasks/gov.js` and require the `--isFork` option to be `true`.

Depending on which task is executed, the current mainnet governor admin or installer admin will be impersonated and topped up with ether on the mainnet fork.

For example, to update the collateral and borrow factor of an asset (e.g., USDC token symbol) or market on the mainnet fork, we can run the following hardhat task with the mainnet USDC token symbol:
    `npx hardhat --network localhost gov:setAssetConfig USDC --cfactor .5 --bfactor .5 --isfork true`

Note: for the hardhat task to fetch the token contract address given the token symbol, the token contract address should be placed within the `existingTokens` property in `test/lib/token-setups/mainnet.js`.

### 5. Repeat step 3 post the governance action
Repeat step 3 with a different file name to store the addresses and health scores after the governance action in step 4. 

Both files are used in step 6 to check the differences in health scores for each address before and after the governance action to determine whether the governance action will affect the health score of an address or put it into violation.

### 6. Parse the health score data for each address extracted in step 3 and 5 
To determine any changes in the health score as a result of the governance action, the health scores in the `.json` files generated in steps 3 and 5 are compared to determine whether the users health score is affected after the governance action performed on the mainnet fork. 

The following command is used with the filename from step 3 specified first, followed by filename of file from step 5 followed by a boolean indicating whether both files should be deleted after parsing them:
    `npx hardhat gov:forkHealthScoreDiff <step_3_file_name> <step_5_file_name> false`

Note: at the end of this step, two output `.json` files are created in the project root folder. 
The first file `accountsAtRiskOfViolation.json` shows accounts that will not immediately be up for liquidation as a result of the governance action but are very close to or could be at risk of liquidation.

The second file `accountsInViolation.json` shows accounts that will immediately be up for liquidation as a result of the governance action.