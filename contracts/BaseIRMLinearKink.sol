// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./BaseIRM.sol";


contract BaseIRMLinearKink is BaseIRM {
    uint public immutable baseRate;
    uint public immutable slope1;
    uint public immutable slope2;
    uint public immutable kink;

    constructor(uint moduleId_, bytes32 moduleGitCommit_, uint baseRate_, uint slope1_, uint slope2_, uint kink_) BaseIRM(moduleId_, moduleGitCommit_) {
        baseRate = baseRate_;
        slope1 = slope1_;
        slope2 = slope2_;
        kink = kink_;
    }

    function computeInterestRateImpl(address, uint32 utilisation) internal override view returns (int96) {
        uint ir = baseRate;

        if (utilisation <= kink) {
            ir += utilisation * slope1;
        } else {
            ir += kink * slope1;
            ir += slope2 * (utilisation - kink);
        }

        return int96(int(ir));
    }
}
