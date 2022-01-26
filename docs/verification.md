# Contract Verification

## Etherscan verification

After deploying a module, it can be verified on etherscan like this:

    NODE_ENV=mainnet npx hardhat verification:get-build contracts/modules/RiskManager.sol verif.json

The `verif.json` file created will be a "standard json" format that can be submitted to etherscan.

## Diffing contracts

Given two contract addresses that have both been verified on etherscan, the differences in their code can be examined with the `verification:diff-contracts` command.

First, the `ETHERSCAN` variable needs to be set in your env file, ie `.env.mainnet`. This should be an API key for etherscan, which is used to download the verified code.

Then run the following command, using the contract addresses you are interested in comparing:

    NODE_ENV=mainnet npx hardhat verification:diff-contracts OLD_ADDR NEW_ADDR

## Diffing a contracts against the git repo

In case you would like to inspect the differences between a verified contract and the current state of the git repo, you can use the `verification:diff-contract-from-repo` command, replacing the contract path and address:

     NODE_ENV=mainnet npx hardhat verification:diff-contract-from-repo contracts/modules/RiskManager.sol ADDR
