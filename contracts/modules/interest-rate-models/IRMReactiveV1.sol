// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";

contract IRMReactiveV1 is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_REACTIVE_V1) {}

    // Parameterised in APR/APY terms 
    int internal constant kD = int(1e27) * int(1) / int(10); // 0.1    
    int internal constant kA = int(1e27) * int(1) / int(10); // 0.1
    int internal constant kC = int(1e27) * int(1) / int(1000); // 0.001

    int internal constant rMax = int(1e27) * int(2); // 200% APR = 2.0
    int internal constant uTarget = int(1e27) * int(7) / int(10); // 0.7

    function computeInterestRate(address, uint32 utilisation, uint32 prevUtilisation, int96 prevInterestRate, uint) external override pure returns (int96) {
        
        // Convert function arguments to same scale 1e27
        int u = int(uint(utilisation)) * int(1e27) / int(uint(type(uint32).max));
        int uLast = int(uint(prevUtilisation)) * int(1e27) / int(uint(type(uint32).max));
        int uDelta = u - uLast;        
        int rLast = int(prevInterestRate) * int(86400 * 365); // TODO: convert SPY to APY, gives loss of precision here, meaning prevInterestRate not exactly equal to rTarget

        // The interest rate if we used a Compound model and were stuck on a line
        int rTarget = kD * uLast / int(1e27);

        // The relative distance between utilisation and its target and the interest rate and its target
        int uDist = 0;
        int rDist = 0;
        if(u < uTarget && rTarget > 0) {
            uDist = (uTarget - u) * int(1e27) / uTarget;
            rDist = -prevInterestRate * int(1e27) / rTarget;
        } else if (u >= uTarget && (rMax - rTarget > 0)) {
            uDist = (u - uTarget) * int(1e27) / (int(1e27) - uTarget);
            rDist = (rMax - prevInterestRate) * int(1e27) / (rMax - rTarget);
        }
        
        // New interest rate depends on three terms - default with param kD, amplification with param kA, and control with param kC
        int r = rLast + uDelta * kD / int(1e27) + (uDist * rDist / int(1e27))  * kA / int(1e27) + (rTarget - rLast) * kC / int(1e27);

        // Final sanity check
        if (r > rMax) {
            r = rMax;
        } else if(r < 0) {
            r = 0;
        }

        // Only calculate per-second basis at the end
        return int96(r / int(86400 * 365));
    }
}
