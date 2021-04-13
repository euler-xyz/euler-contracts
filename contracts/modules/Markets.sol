// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Markets is BaseLogic {
    constructor() BaseLogic(MODULEID__MARKETS) {}

    function activateMarket(address underlying) external nonReentrant returns (address) {
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

        dTokenLookup[address(childDToken)] = childEToken;

        AssetStorage storage assetStorage = eTokenLookup[childEToken];

        assetStorage.underlying = underlying;
        assetStorage.pricingType = params.pricingType;
        assetStorage.pricingParameters = params.pricingParameters;

        assetStorage.eTokenAddress = childEToken;
        assetStorage.dTokenAddress = childDToken;
        assetStorage.underlyingDecimals = decimals;
        assetStorage.interestRateModel = uint32(MODULEID__IRM_LINEAR);


        emit MarketActivated(underlying, childEToken, childDToken);

        return childEToken;
    }


    // General market accessors

    function underlyingToEToken(address underlying) external view returns (address) {
        return underlyingLookup[underlying].eTokenAddress;
    }

    function underlyingToAssetConfig(address underlying) external view returns (AssetConfig memory) {
        return underlyingLookup[underlying];
    }

    function eTokenToUnderlying(address eToken) external view returns (address) {
        return eTokenLookup[eToken].underlying;
    }

    function eTokenToDToken(address eToken) external view returns (address) {
        return eTokenLookup[eToken].dTokenAddress;
    }

    function interestRate(address underlying) external view returns (int96) {
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[underlying].eTokenAddress];
        return assetStorage.interestRate;
    }

    function interestAccumulator(address underlying) external view returns (uint) {
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[underlying].eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        return computeUpdatedInterestAccumulator(assetCache);
    }



    // Enter/exit markets

    function getEnteredMarkets(address account) external view returns (address[] memory) {
        return getEnteredMarketsArray(account);
    }

    function enterMarket(uint subAccountId, address newMarket) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        require(underlyingLookup[newMarket].eTokenAddress != address(0), "e/market-not-activated");

        doEnterMarket(account, newMarket);
    }

    function exitMarket(uint subAccountId, address oldMarket) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        AssetConfig memory config = underlyingLookup[oldMarket];
        require(config.eTokenAddress != address(0), "e/market-not-activated");

        {
            AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
            require(assetStorage.users[account].owed == 0, "e/outstanding-borrow");
        }

        doExitMarket(account, oldMarket);

        if (config.collateralFactor != 0) {
            // FIXME gas: no need to do this check if balance == 0 (should be almost free since owed and balance are packed)
            checkLiquidity(account);
        }
    }
}
