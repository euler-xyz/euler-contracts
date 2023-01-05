// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMConfigurable is BaseIRM {
    struct IRMConfig {
        int64 baseRate;
        uint64 slope1;
        uint64 slope2;
        uint32 kink;
    }

    struct IRMStorage {
        mapping(address => IRMConfig) marketConfig; 
    }

    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_LINEAR_KINK_CONFIGURABLE, moduleGitCommit_) {}

    function reset(address underlying, bytes calldata resetParams) external override {
        IRMConfig storage irmConfig = getConfigInternal(underlying);

        IRMConfig memory newConfig = abi.decode(resetParams, (IRMConfig));

        require (newConfig.baseRate >= MIN_ALLOWED_INTEREST_RATE, "e/irm-configurable/min-allowed-ir");

        int maxIr = newConfig.baseRate;
        maxIr += int(uint(newConfig.slope1) * newConfig.kink);
        maxIr += int(uint(newConfig.slope2) * (type(uint32).max - newConfig.kink));

        require (maxIr <= MAX_ALLOWED_INTEREST_RATE, "e/irm-configurable/max-allowed-ir");

        irmConfig.baseRate = newConfig.baseRate;
        irmConfig.slope1 = newConfig.slope1;
        irmConfig.slope2 = newConfig.slope2;
        irmConfig.kink = newConfig.kink;
    }

    // TODO uncompatible with lens
    function getMarketConfig(address underlying) external view returns (int64, uint64, uint64, uint32) {
        IRMConfig memory irmConfig = getConfigInternal(underlying);
        return (irmConfig.baseRate, irmConfig.slope1, irmConfig.slope2, irmConfig.kink);
    }

    function computeInterestRateImpl(address underlying, uint32 utilisation) internal override view returns (int96) {
        IRMConfig memory irmConfig = getConfigInternal(underlying);
        int ir = irmConfig.baseRate;

        if (utilisation <= irmConfig.kink) {
            ir += int(uint(utilisation) * uint(irmConfig.slope1));
        } else {
            ir += int(uint(irmConfig.kink) * uint(irmConfig.slope1));
            ir += int(uint(irmConfig.slope2) * uint(utilisation - irmConfig.kink));
        }

        return int96(ir);
    }

    function getConfigInternal(address underlying) internal view returns (IRMConfig storage) {
        IRMStorage storage irmStorage;
        {
            bytes32 storagePosition = keccak256("euler.irm.linear.kink.configurable");
            assembly { irmStorage.slot := storagePosition }
        }

        return irmStorage.marketConfig[underlying];
    }
}
