// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";

// This module is only for dev/testing purposes.

contract IRMLinearRecursive is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_LINEAR_RECURSIVE) {}

    int internal constant MAX_IR = 3170979198376458650; // 10% APR = 1e27 * 0.1 / (86400*365)

    function computeInterestRate(address, uint32 utilisation, uint32 prevUtilisation, int96 prevInterestRate, uint256) external pure override returns (int96) {
        int utilisationDelta = int(uint(utilisation)) - int(uint(prevUtilisation));
        return prevInterestRate + int96(MAX_IR * utilisationDelta / int(uint(type(uint32).max)));
    }
}
