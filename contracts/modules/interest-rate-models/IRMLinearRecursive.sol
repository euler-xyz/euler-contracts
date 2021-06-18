// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../BaseIRM.sol";


contract IRMLinearRecursive is BaseIRM {
    constructor() BaseIRM(MODULEID__IRM_LINEAR_RECURSIVE) {}

    int internal constant MAX_IR = 3170979198376458650; // 10% APR = 1e27 * 0.1 / (86400*365)

    struct AssetEntry {
        uint32 prevUtilisation;
        int96 prevInterestRate;
    }

    struct ModelStorage {
        mapping(address => AssetEntry) perAsset;
    }

    function computeInterestRate(address underlying, uint32 utilisation) external view override returns (int96) {
        ModelStorage storage modelStorage;
        {
            bytes32 storagePosition = keccak256("euler.irm.smoothed");
            assembly { modelStorage.slot := storagePosition }
        }

        AssetEntry storage s = modelStorage.perAsset[underlying];

        int utilisationDelta = int(uint(utilisation)) - int(uint(s.prevUtilisation));
        return s.prevInterestRate + int96(MAX_IR * utilisationDelta / int(uint(type(uint32).max)));
    }
}
