// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Governance is BaseLogic {
    constructor() BaseLogic(MODULEID__GOVERNANCE) {}

    modifier governorOnly {
        address msgSender = unpackTrailingParamMsgSender();

        require(msgSender == governorAdmin, "e/gov/unauthorized");
        _;
    }

    function setAssetConfig(address underlying, AssetConfig calldata newConfig) external nonReentrant governorOnly {
        require(underlyingLookup[underlying].eTokenAddress == newConfig.eTokenAddress, "e/gov/etoken-mismatch");
        underlyingLookup[underlying] = newConfig;
    }

    function setIRM(address underlying, uint interestRateModel, bytes calldata resetParams) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        callInternalModule(interestRateModel, abi.encodeWithSelector(IIRM.reset.selector, assetCache.underlying, resetParams));

        // Double store to packed slot since interestRateModel is not written by flushPackedSlot
        assetStorage.interestRateModel = assetCache.interestRateModel = uint32(interestRateModel);

        updateInterestAccumulator(assetStorage, assetCache);
        updateInterestRate(assetCache);
        flushPackedSlot(assetStorage, assetCache);
    }
}
