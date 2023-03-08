// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

// Euler deployment can be configured with tailored values of selected constants. 
// The configuration contracts for a specific chain are stored in sub-folders matching the chain ID.

import "./1/Config.sol";

abstract contract SelectedChainConfig is Config {}