# Repository for Euler-Price-Bot

## Add submodule
git submodule add https://github.com/euler-xyz/euler-contracts.git

## Update submodule
git submodule update --remote euler-contracts

## Run bot
npx hardhat run scripts/price-bot.js --network ropsten
    -> Bot will repeat every hour
