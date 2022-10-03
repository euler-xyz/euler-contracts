// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";
import "hardhat/console.sol"; // FIXME: dev only

contract IRMReactiveV1 is BaseIRM {
    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_REACTIVE_V1, moduleGitCommit_) {}

    // Number of seconds in year
    int internal constant T = int(365.2425 * 86400); // Gregorian calendar

    // Parameterised in APR/APY terms 
    int internal constant kD = int(1e27) * int(1) / int(10) / T; // 0.1
    int internal constant kA = int(1e27) * int(10) / int(1) / T; // max 10% growth per day

    int internal constant rMax = int(1e27) * int(10) / T; // 1000% APR
    int internal constant uTargetLower = int(1e27) * int(7) / int(10); // 0.7
    int internal constant uTargetUpper = int(1e27) * int(8) / int(10); // 0.8

    struct UnderlyingStorage {
        uint32 prevUtilisation;
        int96 prevInterestRate;
        uint40 prevTimestamp;
    }

    struct ModelStorage {
        mapping(address => UnderlyingStorage) underlyingLookup;
    }

    function computeInterestRateImpl(address underlying, uint32 utilisation) internal override returns (int96) {
        // Load previous values from storage

        UnderlyingStorage storage underlyingStorage;
        uint32 prevUtilisation;
        int96 prevInterestRate;
        uint deltaT;

        {
            ModelStorage storage modelStorage;
            {
                bytes32 storagePosition = keccak256("euler.irm.smoothed");
                assembly { modelStorage.slot := storagePosition }
            }

            underlyingStorage = modelStorage.underlyingLookup[underlying];

            prevUtilisation = underlyingStorage.prevUtilisation;
            prevInterestRate = underlyingStorage.prevInterestRate;
            uint40 prevTimestamp = underlyingStorage.prevTimestamp;

            deltaT = block.timestamp - prevTimestamp;
        }


        // Compute change in utilisation
        int u = int(uint(utilisation)) * int(1e27) / int(uint(type(uint32).max));
        int uLast = int(uint(prevUtilisation)) * int(1e27) / int(uint(type(uint32).max));
        int uDelta = u - uLast;        
        int rLast = int(prevInterestRate);

        // Compute relative distance from optimum
        int uDist = 0;
        int rDist = int(1e27);
        if (u < uTargetLower) {
            uDist = -(uTargetLower - u) * int(1e27) / uTargetLower;       
            rDist = rLast * int(1e27) / rMax; // slows control if interest rate is already relatively small
        } else if (u > uTargetUpper) {
            uDist = (u - uTargetUpper) * int(1e27) / (int(1e27) - uTargetUpper);
            rDist = (rMax - rLast) * int(1e27) / rMax; // slows control if interest rate is already relatively large
        }

        // Sets a maximum increase even when gap between transactions is large
        if(deltaT > uint(24 * 60 * 60)) {
            deltaT = uint(24 * 60 * 60);
        }

        int control = uDist * rDist / int(1e27) * int(deltaT) / int(24 * 60 * 60) * kA / int(1e27);

        // Compute base change
        int base = uDelta * kD / int(1e27);

        // Interest rate recursion
        int96 newInterestRate = int96(rLast + base + control);
            
        // Sanity check
        if (newInterestRate > rMax) {
            newInterestRate = int96(rMax);
        } else if(newInterestRate < 0) {
            newInterestRate = 0;
        }

        // Save updated values and return new IR
        underlyingStorage.prevUtilisation = utilisation;
        underlyingStorage.prevInterestRate = newInterestRate;
        underlyingStorage.prevTimestamp = uint40(block.timestamp);

        return newInterestRate;
    }
}
