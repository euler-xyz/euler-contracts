// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMReactive is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_REACTIVE) {}

    uint internal constant AVERAGING_PERIOD = 7 * 24 * 60 * 60;
    //uint internal constant MAX_IR = 2.0 * 1e27 / uint(86400*365.2425);
    uint internal constant TARGET_UTILISATION = 0.8 * 4e9;
    int internal constant REACTIVITY = 0.0000001 * 1e18;

    struct ModelRecord {
        uint40 timestamp;
        uint32 averageUtilisation;
        int184 slope;
    }

    struct ModelStorage {
        mapping(address => ModelRecord) underlyingToModelRecord;
    }

    function computeInterestRate(address underlying, uint32 utilisation) external override returns (int96 interestRate) {
        ModelStorage storage s;
        {
            bytes32 storagePosition = keccak256("euler.irm.smoothed");
            assembly { s.slot := storagePosition }
        }
        ModelRecord memory rec = s.underlyingToModelRecord[underlying];

        uint deltaT = block.timestamp - uint(rec.timestamp);
        uint averageUtilisation;

        {
            uint prevDuration = deltaT >= AVERAGING_PERIOD ? 0 : AVERAGING_PERIOD - deltaT;
            uint currDuration = deltaT >= AVERAGING_PERIOD ? AVERAGING_PERIOD : deltaT;

            averageUtilisation = (uint(rec.averageUtilisation) * prevDuration / AVERAGING_PERIOD) +
                                 (uint(utilisation) * currDuration / AVERAGING_PERIOD);
        }


        //interestRate = int96(int(MAX_IR * averageUtilisation / type(uint32).max));


        int distance;

        if (averageUtilisation < TARGET_UTILISATION) {
            distance = -int((TARGET_UTILISATION - averageUtilisation) * 1e18 / TARGET_UTILISATION);
        } else {
            distance = int((averageUtilisation - TARGET_UTILISATION) * 1e18 / (4e9 - TARGET_UTILISATION));
        }
        console.log("DIST");
        console.logInt(distance);

        int slope = int(rec.slope) + (distance * REACTIVITY / 1e18 * int(deltaT));
        console.log("SLOP");
        console.logInt(slope);

        interestRate = int96(slope * int(averageUtilisation) / 4e9 / 1e18);


        rec.timestamp = uint40(block.timestamp);
        rec.averageUtilisation = uint32(averageUtilisation);
        rec.slope = int184(slope);

        s.underlyingToModelRecord[underlying] = rec;
    }
}
