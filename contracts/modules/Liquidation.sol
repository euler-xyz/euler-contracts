// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Liquidation is BaseLogic {
    constructor() BaseLogic(MODULEID__LIQUIDATION) {}

    function liquidate(address violator, address underlying, address collateral) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();

        require(!isSubAccountOf(violator, msgSender), "e/liq/self-liquidation");

        ILiquidation.LiquidationOpportunity memory liqOpp;

        liqOpp.liquidator = msgSender;
        liqOpp.violator = violator;
        liqOpp.underlying = underlying;
        liqOpp.collateral = collateral;

        liqOpp.underlyingPrice = getAssetPrice(underlying);
        liqOpp.collateralPrice = getAssetPrice(collateral);

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(collateral, collateralAssetStorage);

        liqOpp.underlyingPoolSize = underlyingAssetCache.poolSize;
        liqOpp.collateralPoolSize = collateralAssetCache.poolSize;

        liqOpp.repay = liqOpp.yield = 0;
        computeLiqOpp(underlyingAssetStorage, underlyingAssetCache, collateralAssetStorage, collateralAssetCache, liqOpp);

        // Invoke callback to determine how much liquidator would like to repay

        {
            uint repayDesired = ILiquidator(liqOpp.liquidator).onLiquidationOffer(liqOpp);

            if (repayDesired == 0) return; // at least preserve any observation cardinality increments
            require(repayDesired <= liqOpp.repay, "e/liq/excessive-repay-amount");

            liqOpp.repay = repayDesired;
            liqOpp.yield = repayDesired * liqOpp.conversionRate / 1e18;
        }

        // Liquidator takes on violator's debt:

        transferBorrow(underlyingAssetStorage, underlyingAssetCache, liqOpp.violator, liqOpp.liquidator, liqOpp.repay);
        {
            address proxyAddr = eTokenLookup[underlyingLookup[underlyingAssetCache.underlying].eTokenAddress].dTokenAddress;
            emitViaProxy_Transfer(proxyAddr, liqOpp.violator, liqOpp.liquidator, liqOpp.repay);
        }

        // In exchange, liquidator gets violator's collateral:

        uint collateralAmountInternal = balanceFromUnderlyingAmount(collateralAssetCache, liqOpp.yield);
        transferBalance(collateralAssetStorage, liqOpp.violator, liqOpp.liquidator, collateralAmountInternal);
        {
            address proxyAddr = underlyingLookup[collateralAssetCache.underlying].eTokenAddress;
            emitViaProxy_Transfer(proxyAddr, liqOpp.violator, liqOpp.liquidator, collateralAmountInternal);
        }

        // Since liquidator is taking on new debt, liquidity must be checked:

        checkLiquidity(liqOpp.liquidator);
    }


    function computeLiqOpp(AssetStorage storage underlyingAssetStorage, AssetCache memory underlyingAssetCache,
                           AssetStorage storage collateralAssetStorage, AssetCache memory collateralAssetCache,
                           ILiquidation.LiquidationOpportunity memory liqOpp) private {
        uint collateralValue;
        uint liabilityValue;

        {
            bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                     abi.encodeWithSelector(IRiskManager.computeLiquidity.selector, liqOpp.violator));
            (IRiskManager.LiquidityStatus memory status) = abi.decode(result, (IRiskManager.LiquidityStatus));

            collateralValue = status.collateralValue;
            liabilityValue = status.liabilityValue;
        }

        if (liabilityValue == 0) {
            liqOpp.healthScore = type(uint).max;
            return; // no violation
        }

        liqOpp.healthScore = collateralValue * 1e18 / liabilityValue;

        if (collateralValue >= liabilityValue) {
            return; // no violation
        }

        // At this point healthScore must be < 1 since collateral < liability

        // Compute discount

        {
            uint discount = 1e18 - liqOpp.healthScore;

            if (isProvider(liqOpp.liquidator, liqOpp.underlying)) discount += LIQUIDATION_DISCOUNT_UNDERLYING_PROVIDER;
            if (isProvider(liqOpp.liquidator, liqOpp.collateral)) discount += LIQUIDATION_DISCOUNT_COLLATERAL_PROVIDER;

            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            liqOpp.discount = discount;
            liqOpp.conversionRate = liqOpp.underlyingPrice * 1e18 / liqOpp.collateralPrice * 1e18 / (1e18 - liqOpp.discount);
        }

        // Determine amount to repay to bring user to target health

        uint maxRepay;

        AssetConfig storage underlyingConfig = underlyingLookup[liqOpp.underlying];
        AssetConfig storage collateralConfig = underlyingLookup[liqOpp.collateral];

        {
            uint liabilityValueTarget = liabilityValue * POST_LIQUIDATION_TARGET_HEALTH / 1e18;

            // These factors are first converted into standard 1e18-scale fractions, then adjusted as described in the whitepaper:
            uint borrowAdj = POST_LIQUIDATION_TARGET_HEALTH * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor;
            uint collateralAdj = 1e18 * uint(collateralConfig.collateralFactor) / CONFIG_FACTOR_SCALE * 1e18 / (1e18 - liqOpp.discount);

            uint maxRepayInReference;

            if (liabilityValueTarget <= collateralValue) {
                maxRepayInReference = 0;
            } else if (borrowAdj <= collateralAdj) {
                maxRepayInReference = type(uint).max;
            } else {
                maxRepayInReference = (liabilityValueTarget - collateralValue) * 1e18 / (borrowAdj - collateralAdj);
            }

            maxRepay = maxRepayInReference * 1e18 / liqOpp.underlyingPrice;
        }

        // Limit maxRepay to current owed
        // This can happen when there are multiple borrows and liquidating this one won't cover the shortfall

        {
            uint currentOwed = getCurrentOwed(underlyingAssetStorage, underlyingAssetCache, liqOpp.violator) / INTERNAL_DEBT_PRECISION;
            if (maxRepay > currentOwed) maxRepay = currentOwed;
        }

        // Cap yield at borrower's available collateral, and reduce maxRepay if necessary
        // This can happen when borrower has multiple collaterals

        uint maxYield = maxRepay * liqOpp.conversionRate / 1e18;

        {
            uint collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[liqOpp.violator].balance);

            if (collateralBalance < maxYield) {
                maxRepay = collateralBalance * 1e18 / liqOpp.conversionRate;
                maxYield = collateralBalance;
            }
        }

        liqOpp.repay = maxRepay;
        liqOpp.yield = maxYield;
    }


    function getAssetPrice(address asset) private returns (uint) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPrice.selector, asset));
        return abi.decode(result, (uint));
    }

    function isProvider(address user, address asset) private view returns (bool) {
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[asset].eTokenAddress];

        // A provider is an address with a non-zero EToken balance and an interestAccumulator value
        // from the past, meaning it has held this EToken balance for at least one block.

        if (assetStorage.users[user].balance == 0) return false;

        // FIXME: use updated interest accumulator on asset
        if (assetStorage.users[user].interestAccumulator == assetStorage.interestAccumulator) return false;

        return true;
    }
}
