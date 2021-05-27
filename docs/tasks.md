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


## Check Euler's allowance on token

npx hardhat --network goerli euler tokens.USDC.allowance me euler


## Check your E-token balance

npx hardhat --network goerli euler eTokens.eUSDC.balanceOf me


## Approve and deposit into an eToken

npx hardhat --network goerli euler tokens.USDC.approve euler max

npx hardhat --network goerli euler eTokens.eUSDC.deposit 0 1e18


## Transfer 0.001 eUSDC to burn addr

npx hardhat --network goerli euler eTokens.eUSDC.transferFrom me 0x0000000000000000000000000000000000000001 1e15



## Get entered markets

npx hardhat --network goerli euler markets.getEnteredMarkets me



## Enter market

npx hardhat --network goerli euler markets.enterMarket 0 token:USDC



## Query an asset's config

npx hardhat --network goerli euler markets.underlyingToAssetConfig token:USDC


## Update an asset's config

npx hardhat --network goerli gov:setAssetConfig USDC --cfactor .9 --bfactor .9 --isolated false



## Query an asset's price, as seen by Euler

npx hardhat --network goerli euler --callstatic exec.getPriceFull token:USDC


## Read TWAP directly from uniswap pool (debugging only)

npx hardhat --network goerli uniswap:read-twap USDC ref 3000 1800



## Deploy a non-module contract

npx hardhat --network goerli module:deploy EulerGeneralView
  -> update address in addresses/euler-addresses-goerli.json


## Upgrade a module

npx hardhat --network goerli module:deploy RiskManager
  -> update address in addresses/euler-addresses-goerli.json

npx hardhat --network goerli module:install [address printed in prev step]
