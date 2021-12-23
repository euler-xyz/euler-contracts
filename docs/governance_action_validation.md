## mainnet governance action validation

Before performing a governnace action on the mainnet smart contracts, we would like to know how this will affect users, e.g., will changing the collateral or borrow factors of an asset affect users or put their health score at risk causing them to be in violation / at risk of liquidation and if so, to what degree?

To answer this question, we can perform governance action simulations based on the already deployed smart contracts and users on the mainnet. But to accomplish this, we will also need to impersonate the current mainnet governor admin to enable us call governance related functions.

The proposed steps are as follows:

### 1. Launch hardhat node / localhost network

We will be using this instance of the Hardhat network to fork the mainnet. This means that it will simulate having the same state as mainnet, but it will work as a local development network. That way we can interact with deployed protocols and test complex interactions locally.

`npx hardhat node`

### 2. Fork the mainnet from a specific block number

`npx hardhat --network localhost debug:forkat 13854890`

### 3. Extract all unique user wallet addresses / EOA's that have entered a market from the EnterMarket event

This action will extract all transactions in relation to entering a market up till the latest mainnet block and store the address, healthscore and true or false indicating whether or not the user is in violation or at risk of liquidation. We need to store this in a file named pre_health_scores.json in the project root folder for a later action, i.e., doing a difference check of the health scores before and after the governance action.

`npx hardhat --network localhost markets:forkAccounts pre_health_scores`

### 4. Perform a governance action against the mainnet smart contracts/assets

E.g., setting an assets pricing config or asset config including collateral and borrow factors.

`npx hardhat --network localhost gov:forkSetPricingConfig USDC 2 500`

`npx hardhat --network localhost gov:forkSetAssetConfig DAI --cfactor .5 --bfactor .5 --isolated false`


### 5. Re-compute the health scores post the governance action and extract user address, health score and boolean in violation

Similar to step 3 but saves the data in a file named post_health_scores.json in the project root folder.

`npx hardhat --network localhost markets:forkAccounts post_health_scores`


### 6. Run a difference check on the pre and post health score data

This task will execute a difference check on the pre and post health score data to determine users / EOA's who were not in violation before the governance action but will be in violation after the governance action.

It will log the account/address in violaton as a result of the governance action, the pre health score and post health score.

`npx hardhat markets:healthScoreDiff`