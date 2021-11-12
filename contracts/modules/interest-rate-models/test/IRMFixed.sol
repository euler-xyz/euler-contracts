// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../../BaseIRM.sol";


contract IRMFixed is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_FIXED) {}

    function computeInterestRateImpl(address, uint32) internal override pure returns (int96) {
        return int96(int(uint(1e27 * 0.1) / (86400 * 365))); // not SECONDS_PER_YEAR to avoid breaking tests
    }
}
