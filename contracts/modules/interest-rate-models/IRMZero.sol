// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMZero is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_ZERO) {}

    function computeInterestRate(address, uint32) external override pure returns (int96) {
        return 0;
    }
}
