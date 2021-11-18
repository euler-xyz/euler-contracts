#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Usage: npm run node:fork <ALCHEMY_API_KEY> <FORK_BLOCK_NUMBER> [local]"
    exit 1
fi
trap 'kill $PROXYPID; kill $NODEPID; exit' INT


mv hardhat.config.js hh.tmp
cat <<EOT > hardhat.config.js
module.exports = {
  solidity: "0.8.4",
  networks: {
    hardhat: {
      chainId: 1,
      accounts: {
         mnemonic: 'euler test test test test test test test test test test fork'
      }
    }
  }
};
EOT
if [ "$3" = "local" ]; then
  npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/$1 --fork-block-number $2 --verbose &
else
  npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/$1 --fork-block-number $2 --hostname $(hostname -I) --verbose &
fi


NODEPID=$!
sleep 5
mv hh.tmp hardhat.config.js

if [ "$3" != "local" ]; then
  node $(dirname "$0")/fork-proxy.js $(hostname -I) &
  PROXYPID=$!
fi

tail -f /dev/null
