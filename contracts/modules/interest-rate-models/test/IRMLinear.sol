// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../../BaseIRM.sol";


contract IRMLinear is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_LINEAR) {}

    uint internal constant MAX_IR = uint(1e27 * 0.1) / SECONDS_PER_YEAR;

    function computeInterestRateImpl(address, uint32 utilisation) internal override pure returns (int96) {
        return int96(int(MAX_IR * utilisation / type(uint32).max));
    }
}
