// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// The Euler deployment can be configured with tailored values of some constants. The configurations for a specific chain are
// stored in ./chainConfigs folder, in sub-folders matching the chain ID. Because solidity imports are static, in order to compile
// the code with specific config, the hardhat compile task is overriden to accept COMPILE_CHAIN_ID env variable, which controls 
// which Config contract should be used in compilation.

// deault config for Ethereum Mainnet
import "./1/Config.sol";

abstract contract SelectedChainConfig is Config {}