// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../../BaseIRM.sol";


contract IRMZero is BaseIRM {
    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_ZERO, moduleGitCommit_) {}

    function computeInterestRateImpl(address, uint32) internal override pure returns (int96) {
        return 0;
    }
}
