// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRMLinearKink.sol";


contract IRMDefault is BaseIRMLinearKink {
    constructor(bytes32 moduleGitCommit_)
        BaseIRMLinearKink(MODULEID__IRM_DEFAULT, moduleGitCommit_,
            // Base=0% APR,  Kink(80%)=10% APR  Max=150% APR
            0, 922263673, 51646765633, 3435973836
        ) {}
}
