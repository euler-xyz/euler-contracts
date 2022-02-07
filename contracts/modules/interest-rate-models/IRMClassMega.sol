// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRMLinearKink.sol";


contract IRMClassMega is BaseIRMLinearKink {
    constructor(bytes32 moduleGitCommit_)
        BaseIRMLinearKink(MODULEID__IRM_CLASS__MEGA, moduleGitCommit_,
            // Base=0% APY,  Kink(80%)=8% APY  Max=200% APY
            0, 709783723, 37689273223, 3435973836
        ) {}
}
