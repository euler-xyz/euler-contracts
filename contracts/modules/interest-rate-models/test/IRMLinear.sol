// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../../BaseIRM.sol";


contract IRMLinear is BaseIRM {
    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_LINEAR, moduleGitCommit_) {}

    uint internal constant MAX_IR = uint(1e27 * 0.1) / SECONDS_PER_YEAR;

    function computeInterestRateImpl(address, uint32 utilisation) internal override pure returns (int96) {
        return int96(int(MAX_IR * utilisation / type(uint32).max));
    }
}
