// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMFixed is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_FIXED) {}

    function computeInterestRate(address, uint32) external override pure returns (int96) {
        return 3170979198376458650; // 10% APR = 1e27 * 0.1 / (86400*365)
    }
}
