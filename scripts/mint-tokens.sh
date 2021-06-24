#!/bin/bash

npx hardhat --network ropsten testtoken:mint DAI $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint USDC $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint USDT $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint WBTC $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint UNI $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint COMP $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint REP $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint BZRX $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint DOUGH $1 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint CRV $1 1000000
sleep 2m