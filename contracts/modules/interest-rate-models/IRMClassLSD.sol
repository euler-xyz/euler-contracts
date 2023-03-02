// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRMLinearKink.sol";


contract IRMClassLSD is BaseIRMLinearKink {
    constructor(bytes32 moduleGitCommit_)
        BaseIRMLinearKink(MODULEID__IRM_CLASS__LSD, moduleGitCommit_,
            // Base=0% APY,  Kink(70%)=5% APY  Max=200% APY
            0, 514255952, 25819008208, 3006477107
        ) {}
}
