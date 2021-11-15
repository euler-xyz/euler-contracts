#!/bin/bash

# example usage from project root folder - ./scripts/mint-tokens.sh alchemy 0x6dFa0D799d35DE1924b1EF27cA9ba57FC24a7458
# example usage without script NODE_ENV=alchemy npx hardhat --network ropsten testtoken:mint BAT 0x71e48c397a37597D9813Ef1E11c60F4c5528E3de 1000


NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint DAI $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint USDC $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint USDT $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint WBTC $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint UNI $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint COMP $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint REP $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint BZRX $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint DOUGH $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint CRV $2 1000
sleep 2m
: <<'END'
# cannot mint link in secure mode
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint LINK $2 1000
sleep 2m
END
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint NORD $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint PNK $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint NFY $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint AVGC $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint 127760 $2 1000
sleep 2m
# NEW TOKENS
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint BAT $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint MKR $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint renBTC $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint LUSD $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint MANA $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint CELR $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint CVX $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint renDOGE $2 1000
sleep 2m
NODE_ENV=$1 npx hardhat --network ropsten testtoken:mint AAVE $2 1000
sleep 2m