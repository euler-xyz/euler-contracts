// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMSmoothed is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_SMOOTHED) {}

    uint internal constant AVERAGING_PERIOD = 7 * 24 * 60 * 60;
    uint internal constant MAX_IR = 2.0 * 1e27 / uint(86400*365);

    struct ModelStorage {
        mapping(address => uint) averageUtilisation;
    }

    function computeInterestRate(address underlying, uint32 utilisation, uint32, int96, uint deltaT) external override returns (int96) {
        ModelStorage storage s;
        {
            bytes32 storagePosition = keccak256("euler.irm.smoothed");
            assembly { s.slot := storagePosition }
        }

        uint prevDuration = deltaT >= AVERAGING_PERIOD ? 0 : AVERAGING_PERIOD - deltaT;
        uint currDuration = deltaT >= AVERAGING_PERIOD ? AVERAGING_PERIOD : deltaT;

        uint averageUtilisation = s.averageUtilisation[underlying] =
            (s.averageUtilisation[underlying] * prevDuration / AVERAGING_PERIOD) +
            (averageUtilisation += (uint(utilisation) * 1e18) * currDuration / AVERAGING_PERIOD);

        return int96(int(MAX_IR * (averageUtilisation / 1e18) / type(uint32).max));
    }
}

/*
M = 2

0.5^y = 0.1
y*log(0.5) = log(0.1)
y = log(0.1)/log(0.5)


*/
