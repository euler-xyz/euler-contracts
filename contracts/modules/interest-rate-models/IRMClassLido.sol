// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";

interface ILidoOracle {
    function getLastCompletedReportDelta() external view returns (uint postTotalPooledEther, uint preTotalPooledEther, uint timeElapsed);
}

interface IStETH {
    function getFee() external view returns (uint16 feeBasisPoints);
}

contract IRMClassLido is BaseIRM {
    uint constant SECONDS_PER_DAY = 24 * 60 * 60;
    uint constant MAX_ALLOWED_LIDO_INTEREST_RATE = 1e27 / SECONDS_PER_YEAR; // 100% APR
    uint constant LIDO_BASIS_POINT = 10000;
    address public immutable lidoOracle;
    address public immutable stETH;
    uint public immutable slope1;
    uint public immutable slope2;
    uint public immutable kink;

    struct IRMLidoStorage {
        int96 baseRate;
        uint64 lastCalled;
    }

    constructor(bytes32 moduleGitCommit_) BaseIRM(MODULEID__IRM_CLASS__LIDO, moduleGitCommit_) {
        lidoOracle = 0x442af784A788A5bd6F42A01Ebe9F287a871243fb;
        stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;

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

            if (block.timestamp - irmLido.lastCalled > SECONDS_PER_DAY) {
                (bool successReport, bytes memory dataReport) = lidoOracle.staticcall(abi.encodeWithSelector(ILidoOracle.getLastCompletedReportDelta.selector));
                (bool successFee, bytes memory dataFee) = stETH.staticcall(abi.encodeWithSelector(IStETH.getFee.selector));
                
                // if the external contract calls unsuccessful, the base rate will be set to the last stored value
                if (successReport && successFee && dataReport.length >= (3 * 32) && dataFee.length >= 32) {
                    (uint postTotalPooledEther, uint preTotalPooledEther, uint timeElapsed) = abi.decode(dataReport, (uint, uint, uint));
                    uint16 lidoFee = abi.decode(dataFee, (uint16));

                    // do not support negative rebases
                    // assure Lido reward fee is not greater than LIDO_BASIS_POINT
                    uint baseRate = 0;
                    if (
                        preTotalPooledEther != 0 && 
                        timeElapsed != 0 && 
                        preTotalPooledEther < postTotalPooledEther &&
                        lidoFee < LIDO_BASIS_POINT
                    ) {
                        unchecked {
                            baseRate = 1e27 * (postTotalPooledEther - preTotalPooledEther) / (preTotalPooledEther * timeElapsed);    

                            // reflect Lido reward fee
                            baseRate = baseRate * (LIDO_BASIS_POINT - lidoFee) / LIDO_BASIS_POINT;
                        }
                    }
                    
                    // update the storage only if the Lido oracle call was successful
                    irmLido.baseRate = int96(int(baseRate));
                    irmLido.lastCalled = uint64(block.timestamp);
                }
            }

            ir = uint(int(irmLido.baseRate));

            // avoids potential overflow in subsequent calculations
            if (ir > MAX_ALLOWED_LIDO_INTEREST_RATE) {
                ir = MAX_ALLOWED_LIDO_INTEREST_RATE;
            }
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
