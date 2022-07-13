// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../IRiskManager.sol";
import "../PToken.sol";


/// @notice Activating and querying markets, and maintaining entered markets lists
contract Markets is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__MARKETS, moduleGitCommit_) {}

    /// @notice Create an Euler pool and associated EToken and DToken addresses.
    /// @param underlying The address of an ERC20-compliant token. There must be an initialised uniswap3 pool for the underlying/reference asset pair.
    /// @return The created EToken, or the existing EToken if already activated.
    function activateMarket(address underlying) external nonReentrant returns (address) {
        require(pTokenLookup[underlying] == address(0), "e/markets/invalid-token");
        return doActivateMarket(underlying);
    }

    function doActivateMarket(address underlying) private returns (address) {
        // Pre-existing

        if (underlyingLookup[underlying].eTokenAddress != address(0)) return underlyingLookup[underlying].eTokenAddress;


        // Validation

        require(trustedSenders[underlying].moduleId == 0 && underlying != address(this), "e/markets/invalid-token");

        uint8 decimals = IERC20(underlying).decimals();
        require(decimals <= 18, "e/too-many-decimals");


        // Get risk manager parameters

        IRiskManager.NewMarketParameters memory params;

        {
            bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                     abi.encodeWithSelector(IRiskManager.getNewMarketParameters.selector, underlying));
            (params) = abi.decode(result, (IRiskManager.NewMarketParameters));
        }


        // Create proxies

        address childEToken = params.config.eTokenAddress = _createProxy(MODULEID__ETOKEN);
        address childDToken = _createProxy(MODULEID__DTOKEN);


        // Setup storage

        underlyingLookup[underlying] = params.config;

        dTokenLookup[childDToken] = childEToken;

        AssetStorage storage assetStorage = eTokenLookup[childEToken];

        assetStorage.underlying = underlying;
        assetStorage.pricingType = params.pricingType;
        assetStorage.pricingParameters = params.pricingParameters;

        assetStorage.dTokenAddress = childDToken;

        assetStorage.lastInterestAccumulatorUpdate = uint40(block.timestamp);
        assetStorage.underlyingDecimals = decimals;
        assetStorage.interestRateModel = uint32(MODULEID__IRM_DEFAULT);
        assetStorage.reserveFee = type(uint32).max; // default

        {
            assetStorage.reserveBalance = encodeSmallAmount(INITIAL_RESERVES);
            assetStorage.totalBalances = encodeAmount(INITIAL_RESERVES);
        }

        assetStorage.interestAccumulator = INITIAL_INTEREST_ACCUMULATOR;


        emit MarketActivated(underlying, childEToken, childDToken);

        return childEToken;
    }

    /// @notice Create a pToken and activate it on Euler. pTokens are protected wrappers around assets that prevent borrowing.
    /// @param underlying The address of an ERC20-compliant token. There must already be an activated market on Euler for this underlying, and it must have a non-zero collateral factor.
    /// @return The created pToken, or an existing one if already activated.
    function activatePToken(address underlying) external nonReentrant returns (address) {
        require(pTokenLookup[underlying] == address(0), "e/nested-ptoken");

        if (reversePTokenLookup[underlying] != address(0)) return reversePTokenLookup[underlying];

        {
            AssetConfig memory config = resolveAssetConfig(underlying);
            require(config.collateralFactor != 0, "e/ptoken/not-collateral");
        }
 
        address pTokenAddr = address(new PToken(address(this), underlying));

        pTokenLookup[pTokenAddr] = underlying;
        reversePTokenLookup[underlying] = pTokenAddr;

        emit PTokenActivated(underlying, pTokenAddr);

        doActivateMarket(pTokenAddr);

        return pTokenAddr;
    }


    // General market accessors

    /// @notice Given an underlying, lookup the associated EToken
    /// @param underlying Token address
    /// @return EToken address, or address(0) if not activated
    function underlyingToEToken(address underlying) external view returns (address) {
        return underlyingLookup[underlying].eTokenAddress;
    }

    /// @notice Given an underlying, lookup the associated DToken
    /// @param underlying Token address
    /// @return DToken address, or address(0) if not activated
    function underlyingToDToken(address underlying) external view returns (address) {
        return eTokenLookup[underlyingLookup[underlying].eTokenAddress].dTokenAddress;
    }

    /// @notice Given an underlying, lookup the associated PToken
    /// @param underlying Token address
    /// @return PToken address, or address(0) if it doesn't exist
    function underlyingToPToken(address underlying) external view returns (address) {
        return reversePTokenLookup[underlying];
    }

    /// @notice Looks up the Euler-related configuration for a token, and resolves all default-value placeholders to their currently configured values.
    /// @param underlying Token address
    /// @return Configuration struct
    function underlyingToAssetConfig(address underlying) external view returns (AssetConfig memory) {
        return resolveAssetConfig(underlying);
    }

    /// @notice Looks up the Euler-related configuration for a token, and returns it unresolved (with default-value placeholders)
    /// @param underlying Token address
    /// @return config Configuration struct
    function underlyingToAssetConfigUnresolved(address underlying) external view returns (AssetConfig memory config) {
        config = underlyingLookup[underlying];
        require(config.eTokenAddress != address(0), "e/market-not-activated");
    }

    /// @notice Given an EToken address, looks up the associated underlying
    /// @param eToken EToken address
    /// @return underlying Token address
    function eTokenToUnderlying(address eToken) external view returns (address underlying) {
        underlying = eTokenLookup[eToken].underlying;
        require(underlying != address(0), "e/invalid-etoken");
    }

    /// @notice Given a DToken address, looks up the associated underlying
    /// @param dToken DToken address
    /// @return underlying Token address
    function dTokenToUnderlying(address dToken) external view returns (address underlying) {
        address eToken = dTokenLookup[dToken];
        require(eToken != address(0), "e/invalid-dtoken");
        return eTokenLookup[eToken].underlying;
    }

    /// @notice Given an EToken address, looks up the associated DToken
    /// @param eToken EToken address
    /// @return dTokenAddr DToken address
    function eTokenToDToken(address eToken) external view returns (address dTokenAddr) {
        dTokenAddr = eTokenLookup[eToken].dTokenAddress;
        require(dTokenAddr != address(0), "e/invalid-etoken");
    }


    function getAssetStorage(address underlying) private view returns (AssetStorage storage) {
        address eTokenAddr = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddr != address(0), "e/market-not-activated");
        return eTokenLookup[eTokenAddr];
    }

    /// @notice Looks up an asset's currently configured interest rate model
    /// @param underlying Token address
    /// @return Module ID that represents the interest rate model (IRM)
    function interestRateModel(address underlying) external view returns (uint) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);

        return assetStorage.interestRateModel;
    }

    /// @notice Retrieves the current interest rate for an asset
    /// @param underlying Token address
    /// @return The interest rate in yield-per-second, scaled by 10**27
    function interestRate(address underlying) external view returns (int96) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);

        return assetStorage.interestRate;
    }

    /// @notice Retrieves the current interest rate accumulator for an asset
    /// @param underlying Token address
    /// @return An opaque accumulator that increases as interest is accrued
    function interestAccumulator(address underlying) external view returns (uint) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return assetCache.interestAccumulator;
    }

    /// @notice Retrieves the reserve fee in effect for an asset
    /// @param underlying Token address
    /// @return Amount of interest that is redirected to the reserves, as a fraction scaled by RESERVE_FEE_SCALE (4e9)
    function reserveFee(address underlying) external view returns (uint32) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);

        return assetStorage.reserveFee == type(uint32).max ? uint32(DEFAULT_RESERVE_FEE) : assetStorage.reserveFee;
    }

    /// @notice Retrieves the pricing config for an asset
    /// @param underlying Token address
    /// @return pricingType (1=pegged, 2=uniswap3, 3=forwarded, 4=chainlink)
    /// @return pricingParameters If uniswap3 pricingType then this represents the uniswap pool fee used, if chainlink pricing type this represents the fallback uniswap pool fee or 0 if none
    /// @return pricingForwarded If forwarded pricingType then this is the address prices are forwarded to, otherwise address(0)
    function getPricingConfig(address underlying) external view returns (uint16 pricingType, uint32 pricingParameters, address pricingForwarded) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);

        pricingType = assetStorage.pricingType;
        pricingParameters = assetStorage.pricingParameters;

        pricingForwarded = pricingType == PRICINGTYPE__FORWARDED ? pTokenLookup[underlying] : address(0);
    }

    /// @notice Retrieves the Chainlink price feed config for an asset
    /// @param underlying Token address
    /// @return chainlinkAggregator Chainlink aggregator proxy address
    function getChainlinkPriceFeedConfig(address underlying) external view returns (address chainlinkAggregator) {
        chainlinkAggregator = chainlinkPriceFeedLookup[underlying];
    }

    
    // Enter/exit markets

    /// @notice Retrieves the list of entered markets for an account (assets enabled for collateral or borrowing)
    /// @param account User account
    /// @return List of underlying token addresses
    function getEnteredMarkets(address account) external view returns (address[] memory) {
        return getEnteredMarketsArray(account);
    }

    /// @notice Add an asset to the entered market list, or do nothing if already entered
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param newMarket Underlying token address
    function enterMarket(uint subAccountId, address newMarket) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        require(underlyingLookup[newMarket].eTokenAddress != address(0), "e/market-not-activated");

        doEnterMarket(account, newMarket);
    }

    /// @notice Remove an asset from the entered market list, or do nothing if not already present
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param oldMarket Underlying token address
    function exitMarket(uint subAccountId, address oldMarket) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        AssetConfig memory config = resolveAssetConfig(oldMarket);
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];

        uint balance = assetStorage.users[account].balance;
        uint owed = assetStorage.users[account].owed;

        require(owed == 0, "e/outstanding-borrow");

        doExitMarket(account, oldMarket);

        if (config.collateralFactor != 0 && balance != 0) {
            checkLiquidity(account);
        }
    }
}
