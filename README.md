# Repository for Euler-Price-Bot

## Submodule setup
    git submodule add https://github.com/euler-xyz/euler-contracts.git
    cd euler-contracts
    npm i
    npx hardhat compile

## Update submodule
    git submodule update --init euler-contracts

## .env configs
Create .env file with two variables - PRIVATE_KEY (Ropsten test network wallet private key) and ALCHEMY_API_KEY ([alchemy](https://www.alchemy.com/) key for Ropsten test network)

## install dependencies
    npm i

## Run bot
    npx hardhat run scripts/price-bot.js --network ropsten
