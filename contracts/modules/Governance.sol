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

        callInternalModule(interestRateModel, abi.encodeWithSelector(IIRM.reset.selector, underlying, resetParams));

        assetStorage.interestRateModel = assetCache.interestRateModel = uint32(interestRateModel);

        updateInterestRate(assetStorage, assetCache);
    }

    function setReserveFee(address underlying, uint32 newReserveFee) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        require(newReserveFee <= RESERVE_FEE_SCALE || newReserveFee == type(uint32).max, "e/gov/bad-reserve-fee");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        assetStorage.reserveFee = assetCache.reserveFee = newReserveFee;
    }

    function convertReserves(address underlying, address recipient, uint amount) external nonReentrant governorOnly {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddress != address(0), "e/gov/underlying-not-activated");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) amount = assetStorage.reserveBalance;
        require(amount <= assetStorage.reserveBalance, "e/gov/insufficient-reserves");

        emit ReservesConverted(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));

        assetStorage.reserveBalance = assetCache.reserveBalance = assetCache.reserveBalance - uint96(amount);
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eTokenAddress, recipient, amount);
    }


    // getters

    function getGovernorAdmin() external view returns (address) {
        return governorAdmin;
    }
}
