// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../BaseIRM.sol";


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

        emit GovSetAssetConfig(underlying, newConfig);
    }

    function setIRM(address underlying, uint interestRateModel, bytes calldata resetParams) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        callInternalModule(interestRateModel, abi.encodeWithSelector(BaseIRM.reset.selector, underlying, resetParams));

        assetStorage.interestRateModel = assetCache.interestRateModel = uint32(interestRateModel);

        updateInterestRate(assetStorage, assetCache);

        logAssetStatus(assetCache);

        emit GovSetIRM(underlying, interestRateModel, resetParams);
    }

    function setPricingConfig(address underlying, uint16 newPricingType, uint32 newPricingParameter) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        require(newPricingType == assetCache.pricingType, "e/gov/pricing-type-change-not-supported");

        assetStorage.pricingType = assetCache.pricingType = newPricingType;
        assetStorage.pricingParameters = assetCache.pricingParameters = newPricingParameter;

        emit GovSetPricingConfig(underlying, newPricingType, newPricingParameter);
    }

    function setReserveFee(address underlying, uint32 newReserveFee) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");

        require(newReserveFee <= RESERVE_FEE_SCALE || newReserveFee == type(uint32).max, "e/gov/bad-reserve-fee");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        assetStorage.reserveFee = assetCache.reserveFee = newReserveFee;

        emit GovSetReserveFee(underlying, newReserveFee);
    }

    function convertReserves(address underlying, address recipient, uint amount) external nonReentrant governorOnly {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddress != address(0), "e/gov/underlying-not-activated");

        updateAverageLiquidity(recipient);

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) amount = assetStorage.reserveBalance;
        require(amount <= assetStorage.reserveBalance, "e/gov/insufficient-reserves");

        assetStorage.reserveBalance = assetCache.reserveBalance = assetCache.reserveBalance - uint96(amount);
        // Decrease totalBalances because increaseBalance will increase it by amount
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eTokenAddress, recipient, amount);

        logAssetStatus(assetCache);

        emit GovConvertReserves(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));
    }


    // getters

    function getGovernorAdmin() external view returns (address) {
        return governorAdmin;
    }
}
