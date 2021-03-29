// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


// This module is only for dev/testing purposes.

contract IRMZero is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_ZERO) {}

    function computeInterestRate(address, uint32, uint32, int96, uint) external override pure returns (int96) {
        return 0;
    }
}
