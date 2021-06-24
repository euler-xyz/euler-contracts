# Repository for Euler-Price-Bot

## Add submodule
    git submodule add https://github.com/euler-xyz/euler-contracts.git

## Update submodule
    git submodule update --remote euler-contracts

## .env configs
Create .env file with two variables - PRIVATE_KEY (Ropsten test network wallet private key) and ALCHEMY_API_KEY ([alchemy](https://www.alchemy.com/) key for Ropsten test network)

## Run bot
    npx hardhat run scripts/price-bot.js --network ropsten

Bot will repeat every hour
