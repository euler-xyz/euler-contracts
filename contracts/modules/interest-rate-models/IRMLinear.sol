// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMLinear is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_LINEAR) {}

    uint internal constant MAX_IR = 3170979198376458650; // 10% APR = 1e27 * 0.1 / (86400*365)

    function computeInterestRate(address, uint32 utilisation) external override pure returns (int96) {
        return int96(int(MAX_IR * utilisation / type(uint32).max));
    }
}
