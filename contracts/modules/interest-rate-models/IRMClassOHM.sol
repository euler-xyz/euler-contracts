// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRMLinearKink.sol";


contract IRMClassOHM is BaseIRMLinearKink {
    constructor(bytes32 moduleGitCommit_)
        BaseIRMLinearKink(MODULEID__IRM_CLASS__OHM, moduleGitCommit_,
            // Base=5% APY,  Kink(80%)=20% APY  Max=300% APY
            1546098748700444833, 1231511520, 44415215206, 3435973836
        ) {}
}
