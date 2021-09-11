## custom environments
The [custom-env](https://www.npmjs.com/package/custom-env) npm module allows us to have seperate .env files for different environments, e.g., staging/production or alchemy/infura/rivet. 

For each blockchain node provider, e.g., alchemy, rivet or infura, we need to create a separate .env file names as .env.<provider name>, i.e., ```.env.alchemy``` with the following environment variables on a new line:

```
PRIVATE_KEY="c....."
WALLET_ADDRESS="0x71e48c397a37597D9813Ef1E11c60F4c5528E3de"
RPC_URL_KOVAN="eth-kovan.alchemyapi.io/v2/....."
RPC_URL_ROPSTEN="eth-ropsten.alchemyapi.io/v2/...."
RPC_URL_GOERLI="eth-goerli.alchemyapi.io/v2/....."
```

When running a hardhat command or task from the command line, to point to a specific environment file, we can do this using an environment variable called `NODE_ENV` that points to the environment name, with the `--network` flag that will tell the hardhat config which network url to use within the environment file e.g., alchemy as follows:

NODE_ENV=alchemy npx hardhat --network ropsten testtoken:balanceOf USDC 0x71e48c397a37597D9813Ef1E11c60F4c5528E3de

An error message specifying that the network does not exist is returned if the .env RPC URL variable for the network is not set.