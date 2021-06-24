#!/bin/bash

address=0x00E21f272A5829c842702d0bA92D99A8727D6207

npx hardhat --network ropsten testtoken:mint DAI $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint USDC $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint USDT $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint WBTC $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint UNI $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint COMP $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint REP $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint BZRX $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint DOUGH $address 1000000
sleep 2m
npx hardhat --network ropsten testtoken:mint CRV $address 1000000
sleep 2m