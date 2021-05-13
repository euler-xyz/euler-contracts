# Tasks cheat-sheet


## Create and activate a test token

npx hardhat --network goerli testtoken:deploy 'USD Coin' USDC
  -> put address into test/lib/token-setups/goerli.js

npx hardhat --network goerli uniswap:create-pool USDC ref

npx hardhat --network goerli euler markets.activateMarket token:USDC



## Get underlying token balance

npx hardhat --network goerli euler tokens.USDC.balanceOf me


## Mint test tokens

npx hardhat --network goerli testtoken:mint USDC me 1000000



## Query an asset's config

npx hardhat --network goerli euler markets.underlyingToAssetConfig token:USDC


## Update an asset's config

npx hardhat --network goerli gov:setAssetConfig USDC --cfactor .9 --bfactor .9 --isolated false



## Query an asset's price, as seen by Euler

npx hardhat --network goerli euler --callstatic exec.getPriceFull token:USDC


## Read TWAP directly from uniswap pool (debugging only)

npx hardhat --network goerli uniswap:read-twap USDC ref 3000 1800
