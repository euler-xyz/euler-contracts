#!/bin/bash

if [ $# -eq 0 ]; then
    echo "Usage: npm run node:fork <ALCHEMY_API_KEY> <FORK_BLOCK_NUMBER>"
    exit 1
fi
trap 'kill $PROXYPID; kill $NODEPID; exit' INT
node $(dirname "$0")/fork-proxy.js $(hostname -I) &
PROXYPID=$!

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
npx hardhat node --fork https://eth-mainnet.alchemyapi.io/v2/$1 --fork-block-number $2 --hostname $(hostname -I) --verbose &
NODEPID=$!
sleep 3
mv hh.tmp hardhat.config.js
tail -f /dev/null
