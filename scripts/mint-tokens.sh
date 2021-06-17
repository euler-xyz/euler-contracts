#!/bin/bash

address=0xcc5804530921c0549c18527dfACad5c0Ea07A4D1

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