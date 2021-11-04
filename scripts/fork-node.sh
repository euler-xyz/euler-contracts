#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Usage: npm run node:fork <ALCHEMY_API_KEY> <FORK_BLOCK_NUMBER>"
    exit 1
fi

node $(dirname "$0")/fork-proxy.js $(hostname -I) &
npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/$1 --fork-block-number $2 --hostname $(hostname -I) --verbose 
&& kill $!
