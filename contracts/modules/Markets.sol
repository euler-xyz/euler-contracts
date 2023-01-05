// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../IRiskManager.sol";
import "./WrapperDeployer.sol";
import "./Governance.sol";


/// @notice Activating and querying markets, and maintaining entered markets lists
contract Markets is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__MARKETS, moduleGitCommit_) {}

    /// @notice Create an Euler pool and associated EToken and DToken addresses.
    /// @param underlying The address of an ERC20-compliant token. There must be an initialised uniswap3 pool for the underlying/reference asset pair.
    /// @return The created EToken, or the existing EToken if already activated.
    function activateMarket(address underlying) external nonReentrant returns (address) {
        require(pTokenLookup[underlying] == address(0) && weTokenLookup[underlying] == address(0), "e/markets/invalid-token");
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
        require(weTokenLookup[underlying] == address(0), "e/ptoken/invalid-underlying");

        if (reversePTokenLookup[underlying] != address(0)) return reversePTokenLookup[underlying];

        {
            AssetConfig memory config = resolveAssetConfig(underlying);
            require(config.collateralFactor != 0, "e/ptoken/not-collateral");
        }
 
        bytes memory result = callInternalModule(MODULEID__WRAPPER_DEPLOYER,
                                                 abi.encodeWithSelector(WrapperDeployer.deployPToken.selector, underlying));
        (address pTokenAddr) = abi.decode(result, (address));

        pTokenLookup[pTokenAddr] = underlying;
        reversePTokenLookup[underlying] = pTokenAddr;

        emit PTokenActivated(underlying, pTokenAddr);

        doActivateMarket(pTokenAddr);

        return pTokenAddr;
    }

    /// @notice Struct defining an override for the new weToken.
    /// @param underlying The address of the collateral token.
    /// @param collateralFactor The collateral factor for the override.
    struct OverrideCollateral {
        address underlying;
        uint32 collateralFactor;
    }

    /// @notice Struct defining the configuration of a new weToken.
    /// @param interestRateModel An id of the IRM module to use.
    /// @param interestRateModelResetParams Encoded params used to initialize the IRM if required.
    /// @param reserveFee Reserve fee for the new weToken market.
    /// @param reserveRecipient The address that can claim a part of the reserves.
    /// @param overrideCollaterals An array of tokens that can be used as collateral to borrow the new weToken and collateral factors to use. Use SELF_ADDRESS_PLACEHOLDER to override self-collateral factor. 
    struct WETokenConfig {
        uint interestRateModel;
        bytes interestRateModelResetParams;

        uint32 reserveFee;
        address reserveRecipient;

        OverrideCollateral[] overrideCollaterals;
    }

    address constant SELF_ADDRESS_PLACEHOLDER = address(type(uint160).max);

    /// @notice Create a weToken and activate it on Euler. weTokens are wrappers around eTokens used with config overrides.
    /// @param eToken The address of a valid eToken. Only eTokens with external underlying are valid.
    /// @param config The configuration of the new weToken.
    /// @return The created weToken address.
    function activateWEToken(address eToken, WETokenConfig calldata config) external nonReentrant returns (address) {
        address msgSender = unpackTrailingParamMsgSender();
        bytes memory result = callInternalModule(MODULEID__GOVERNANCE,
                                                 abi.encodeWithSelector(Governance.getGovernorAdmin.selector));
        (address governorAdmin) = abi.decode(result, (address));
        require(msgSender == governorAdmin, "e/gov/unauthorized");


        require(eTokenLookup[eToken].underlying != address(0), "e/wetoken/invalid-etoken");
        require(pTokenLookup[eTokenLookup[eToken].underlying] == address(0), "e/wetoken/invalid-etoken-underlying");
        require(weTokenLookup[eTokenLookup[eToken].underlying] == address(0), "e/nested-wetoken");

        result = callInternalModule(MODULEID__WRAPPER_DEPLOYER,
                                                 abi.encodeWithSelector(WrapperDeployer.deployWEToken.selector, eToken));
        (address weTokenAddr) = abi.decode(result, (address));

        weTokenLookup[weTokenAddr] = eToken;

        emit WETokenActivated(eToken, weTokenAddr);

        doActivateMarket(weTokenAddr);
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[weTokenAddr].eTokenAddress];

        // Reserves

        require(config.reserveRecipient != address(0), "e/wetoken/reserve-recipient");
        // TODO max reserve fee? Min reserve fee?
        require(
            config.reserveFee <= RESERVE_FEE_SCALE || config.reserveFee == type(uint32).max,
            "e/wetoken/reserve-fee"
        );
        assetStorage.reserveFee = config.reserveFee;
        weTokenStorage[weTokenAddr].reserveRecipient = config.reserveRecipient;
        weTokenStorage[weTokenAddr].daoReserveShare = type(uint32).max; // resolves to default dao reserves

        // IRM

        AssetCache memory assetCache;
        initAssetCache(weTokenAddr, assetStorage, assetCache);
        setMarketIRM(assetStorage, assetCache, config.interestRateModel, config.interestRateModelResetParams);

        // Overrides

        require(config.overrideCollaterals.length <= MAX_INITIAL_WETOKEN_OVERRIDES, 'e/wetoken/too-many-overrides');

        for (uint i = 0; i < config.overrideCollaterals.length; ++i) {
            OverrideCollateral memory overrideCollateral = config.overrideCollaterals[i];
            OverrideConfig memory overrideConfig = OverrideConfig({
                enabled: true,
                collateralFactor: overrideCollateral.collateralFactor
            });
            address underlying = overrideCollateral.underlying;

            // replace placeholder for the WEToken address for self-collateral override
            if (underlying == SELF_ADDRESS_PLACEHOLDER) underlying = weTokenAddr;
            setCollateralFactorOverride(weTokenAddr, underlying, overrideConfig);
        }

        // TODO emit configs?

        return weTokenAddr;
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

    /// @notice Given a WEToken address, looks up the associated underlying
    /// @param weToken WEToken address
    /// @return underlying Token address
    function weTokenToUnderlying(address weToken) external view returns (address underlying) {
        underlying = eTokenLookup[weTokenLookup[weToken]].underlying;
        require(underlying != address(0), "e/invalid-wetoken");
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

    /// @notice Retrieves the reserves config for WEToken
    /// @param weToken WEToken address
    /// @return reserveRecipient Address allowed to claim reserves not belonging to the DAO
    /// @return daoReserveShare Amount of reserve share belonging to the DAO, as a fraction scaled by RESERVE_FEE_SCALE (4e9)
    function getWETokenReservesConfig(address weToken) external view returns (address reserveRecipient, uint32 daoReserveShare) {
        require(weTokenLookup[weToken] != address(0), 'e/invalid-wetoken');
        WETokenStorage storage weTokenStorage = weTokenStorage[weToken];

        reserveRecipient = weTokenStorage.reserveRecipient;
        daoReserveShare = resolveDaoReserveShare(weTokenStorage);
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
    /// @return pricingType (1=pegged, 2=uniswap3, 3=forwarded, 4=chainlink, 5=wrapped_etoken)
    /// @return pricingParameters If uniswap3 pricingType then this represents the uniswap pool fee used, if chainlink pricing type this represents the fallback uniswap pool fee or 0 if none
    /// @return pricingForwarded If forwarded pricingType then this is the address prices are forwarded to, otherwise address(0)
    function getPricingConfig(address underlying) external view returns (uint16 pricingType, uint32 pricingParameters, address pricingForwarded) {
        AssetStorage storage assetStorage = getAssetStorage(underlying);

        pricingType = assetStorage.pricingType;
        pricingParameters = assetStorage.pricingParameters;

        // TODO should WEToken be considered pricing forwarded
        pricingForwarded = pricingType == PRICINGTYPE__FORWARDED 
            ? pTokenLookup[underlying] 
            : pricingType == PRICINGTYPE__WRAPPED_ETOKEN
                ? eTokenLookup[weTokenLookup[underlying]].underlying
                : address(0);
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

    // Overrides

    /// @notice Retrieves collateral factor override for asset pair
    /// @param liability Borrowed underlying
    /// @param collateral Collateral underlying
    /// @return Override config set for the pair
    function getOverride(address liability, address collateral) external view returns (OverrideConfig memory) {
        return overrideLookup[liability][collateral];
    }

    /// @notice Retrieves a list of collaterals configured through override for the liability asset
    /// @param liability Borrowed underlying 
    /// @return List of underlying collaterals with override configured
    /// @dev The list can have duplicates. Returned assets could have the override disabled
    function getOverrideCollaterals(address liability) external view returns (address[] memory) {
        return overrideCollaterals[liability];
    }

    /// @notice Retrieves a list of liabilities configured through override for the collateral asset
    /// @param collateral Collateral underlying 
    /// @return List of underlying liabilities with override configured
    /// @dev The list can have duplicates. Returned assets could have the override disabled
    function getOverrideLiabilities(address collateral) external view returns (address[] memory) {
        return overrideLiabilities[collateral];
    }


}
