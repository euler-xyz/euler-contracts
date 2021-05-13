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



    // setters

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

        // Interest rate model is updated first, so that accrueInterest invokes the new IRM to install the upcoming rate

        // Redundant store to packed slot since interestRateModel is not written by flushPackedSlot
        assetStorage.interestRateModel = assetCache.interestRateModel = uint32(interestRateModel);

        accrueInterest(assetStorage, assetCache);
    }

    function setReserveFee(address underlying, uint32 newReserveFee) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        require(newReserveFee <= RESERVE_FEE_SCALE || newReserveFee == type(uint32).max, "e/gov/bad-reserve-fee");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        // Accrue first to update the accumulator so that the pending fees are accrued at the previous fee level

        accrueInterest(assetStorage, assetCache);

        assetStorage.reserveFee = assetCache.reserveFee = newReserveFee;
    }

    function convertReserves(address underlying, address recipient, uint amount) external nonReentrant governorOnly {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddress != address(0), "e/gov/underlying-not-activated");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        // Accrue first, so that full amount is available

        accrueInterest(assetStorage, assetCache);

        if (amount == type(uint).max) amount = assetStorage.reserveBalance;
        require(amount <= assetStorage.reserveBalance, "e/gov/insufficient-reserves");

        emit ReservesConverted(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));

        assetStorage.reserveBalance -= uint96(amount);
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eTokenAddress, recipient, amount);
    }


    // getters

    function getGovernorAdmin() external view returns (address) {
        return governorAdmin;
    }
}
