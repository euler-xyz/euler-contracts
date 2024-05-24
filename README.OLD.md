# Euler Smart Contracts

This repo contains the smart contracts and tests for the [Euler Protocol](https://www.euler.finance/).

## Setup

    npm i

## Testing

    npx hardhat test

## Generate coverage report

    npx hardhat coverage

## Docs

* [General Euler Docs](https://docs.euler.finance/)
* [Contract Architecturel](https://docs.euler.finance/developers/getting-started/architecture)
* [Contract Reference](https://docs.euler.finance/developers/getting-started/contract-reference)
* [IEuler.sol Solidity Interface](https://github.com/euler-xyz/euler-interfaces/blob/master/contracts/IEuler.sol)

## License

All files are licensed under GPL-2.0 or later except for the following, which are licensed under Business Source License 1.1 (see the file `LICENSE`):

* `contracts/modules/RiskManager.sol`
* `contracts/modules/Liquidation.sol`

These two files will be automatically re-licensed under GPL-2.0 on December 13th, 2023.
