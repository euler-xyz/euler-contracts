# Tasks cheat-sheet


## Create and activate a test token

npx hardhat --network ropsten testtoken:deploy 'USD Coin' USDC --decimals 6
  -> put address into test/lib/token-setups/ropsten.js

npx hardhat --network ropsten uniswap:create-pool USDC ref

npx hardhat --network ropsten euler markets.activateMarket USDC




## Read full view of token

npx hardhat --network ropsten view token:USDC


## Get underlying token balance

npx hardhat --network ropsten euler tokens.USDC.balanceOf me


## Mint test tokens

npx hardhat --network ropsten testtoken:mint USDC me 1000000


## Check Euler's allowance on token

npx hardhat --network ropsten euler tokens.USDC.allowance me euler


## Check your E-token balance

npx hardhat --network ropsten euler eTokens.eUSDC.balanceOf me


## Approve and deposit into an eToken

npx hardhat --network ropsten euler tokens.USDC.approve euler max

npx hardhat --network ropsten euler eTokens.eUSDC.deposit 0 1e18


## Transfer 0.001 eUSDC to burn addr

npx hardhat --network ropsten euler eTokens.eUSDC.transferFrom me 0x0000000000000000000000000000000000000001 1e15



## Get entered markets

npx hardhat --network ropsten euler markets.getEnteredMarkets me



## Enter market

npx hardhat --network ropsten euler markets.enterMarket 0 token:USDC



## Query an asset's config

npx hardhat --network ropsten euler markets.underlyingToAssetConfig token:USDC


## Update an asset's config

npx hardhat --network ropsten gov:setAssetConfig USDC --cfactor .9 --bfactor .9 --isolated false


## Update an asset's pricing config

npx hardhat --network ropsten gov:setPricingConfig USDC 2 500


## Query an asset's price, as seen by Euler

npx hardhat --network ropsten euler --callstatic exec.getPriceFull token:USDC


## Read TWAP directly from uniswap pool (debugging only)

npx hardhat --network ropsten uniswap:read-twap USDC ref 3000 1800



## Deploy a non-module contract

npx hardhat --network ropsten module:deploy EulerGeneralView
  -> update address in addresses/euler-addresses-ropsten.json


## Upgrade a module

npx hardhat --network ropsten module:deploy RiskManager
  -> update address in addresses/euler-addresses-ropsten.json

npx hardhat --network ropsten module:install [address printed in prev step]



## Activate PToken

npx hardhat --network ropsten euler markets.activatePToken token:USDC
