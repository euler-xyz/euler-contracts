// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../BaseIRM.sol";


contract Governance is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__GOVERNANCE, moduleGitCommit_) {}

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
        require(newPricingType > 0 && newPricingType < PRICINGTYPE__OUT_OF_BOUNDS, "e/gov/bad-pricing-type");

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddr];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        assetStorage.pricingType = assetCache.pricingType = newPricingType;
        assetStorage.pricingParameters = assetCache.pricingParameters = newPricingParameter;

        if (newPricingType == PRICINGTYPE__CHAINLINK) {
            require(chainlinkPriceFeedLookup[underlying] != address(0), "e/gov/chainlink-price-feed-not-initialized");
        }

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
        require(assetStorage.reserveBalance >= INITIAL_RESERVES, "e/gov/reserves-depleted");
        
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint maxAmount = assetCache.reserveBalance - INITIAL_RESERVES;
        if (amount == type(uint).max) amount = maxAmount;
        require(amount <= maxAmount, "e/gov/insufficient-reserves");

        assetStorage.reserveBalance = assetCache.reserveBalance = assetCache.reserveBalance - uint96(amount);
        // Decrease totalBalances because increaseBalance will increase it by amount
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eTokenAddress, recipient, amount);

        if (assetStorage.users[recipient].owed != 0) checkLiquidity(recipient);

        logAssetStatus(assetCache);

        emit GovConvertReserves(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));
    }

    function setChainlinkPriceFeed(address underlying, address chainlinkAggregator) external nonReentrant governorOnly {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/gov/underlying-not-activated");
        require(chainlinkAggregator != address(0), "e/gov/bad-chainlink-address");

        chainlinkPriceFeedLookup[underlying] = chainlinkAggregator;

        emit GovSetChainlinkPriceFeed(underlying, chainlinkAggregator);
    }


    // getters

    function getGovernorAdmin() external view returns (address) {
        return governorAdmin;
    }
}
