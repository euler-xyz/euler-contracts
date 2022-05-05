// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";

interface ILidoOracle {
    function getLastCompletedReportDelta() external view returns (uint postTotalPooledEther, uint preTotalPooledEther, uint timeElapsed);
}

contract IRMClassLido is BaseIRM {
    uint constant A_DAY = 24 * 60 * 60;
    address public immutable lidoOracle;
    uint public immutable slope1;
    uint public immutable slope2;
    uint public immutable kink;

    struct IRMLidoStorage {
        int96 baseRate;
        uint64 lastCalled;
    }

    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_CLASS__LIDO, moduleGitCommit_) {
        lidoOracle = 0x442af784A788A5bd6F42A01Ebe9F287a871243fb;

        // Base=Lido APY,  Kink(80%)=8% APY  Max=200% APY
        slope1 = 709783723;
        slope2 = 37689273223;
        kink = 3435973836;
    }

    function computeInterestRateImpl(address, uint32 utilisation) internal override returns (int96) {
        uint ir = 0;
        if (utilisation > 0) {
            IRMLidoStorage storage irmLido;
            {
                bytes32 storagePosition = keccak256("euler.irm.class.lido");
                assembly { irmLido.slot := storagePosition }
            }

            if (block.timestamp - irmLido.lastCalled > A_DAY) {
                (bool success, bytes memory data) = lidoOracle.staticcall(abi.encodeWithSelector(ILidoOracle.getLastCompletedReportDelta.selector));
                
                // if the Lido oracle call unsuccessful, the base rate will be set to the last stored value
                if (success) {
                    (uint postTotalPooledEther, uint preTotalPooledEther, uint timeElapsed) = abi.decode(data, (uint, uint, uint));
                    
                    // do not support negative rebases
                    uint baseRate = preTotalPooledEther >= postTotalPooledEther
                        ? 0 
                        : 1e27 * (postTotalPooledEther - preTotalPooledEther) / (preTotalPooledEther * timeElapsed);

                    // reflect Lido 10% reward fee
                    baseRate = baseRate * 9 / 10;
                    
                    // update the storage only if the Lido oracle call was successful
                    irmLido.baseRate = int96(int(baseRate));
                    irmLido.lastCalled = uint64(block.timestamp);
                }
            }
            ir = uint(int(irmLido.baseRate));
        }
        
        if (utilisation <= kink) {
            ir += utilisation * slope1;
        } else {
            ir += kink * slope1;
            ir += slope2 * (utilisation - kink);
        }

        return int96(int(ir));
    }
}
