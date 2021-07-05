// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Liquidation is BaseLogic {
    constructor() BaseLogic(MODULEID__LIQUIDATION) {}

    // Maximum discount that can be rewarded under any conditions:
    uint private constant MAXIMUM_DISCOUNT = 0.25 * 1e18;

    // How much faster the bonus grows for a fully funded supplier. Partially-funded suppliers
    // have this scaled proportional to their free-liquidity divided by the violator's liability.
    uint private constant SUPPLIER_BONUS_SLOPE = 2 * 1e18;

    // How much supplier discount can be awarded beyond the base discount.
    uint private constant MAXIMUM_SUPPLIER_BONUS = 0.025 * 1e18;

    // Post-liquidation target health score that determines maximum liquidation sizes.
    uint private constant TARGET_HEALTH = 1.2 * 1e18;


    struct LiquidationLocals {
        address liquidator;
        address violator;
        address underlying;
        address collateral;

        uint underlyingPrice;
        uint collateralPrice;
        uint conversionRate;
    }

    function checkLiquidation(address liquidator, address violator, address underlying, address collateral) public nonReentrant returns (ILiquidation.LiquidationOpportunity memory liqOpp) {
        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.underlying = underlying;
        liqLocs.collateral = collateral;

        liqLocs.underlyingPrice = getAssetPrice(underlying);
        liqLocs.collateralPrice = getAssetPrice(collateral);

        return computeLiqOpp(liqLocs);
    }

    function computeLiqOpp(LiquidationLocals memory liqLocs) private returns (ILiquidation.LiquidationOpportunity memory liqOpp) {
        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);

        liqOpp.repay = liqOpp.yield = 0;

        (uint collateralValue, uint liabilityValue) = getAccountLiquidity(liqLocs.violator);

        if (liabilityValue == 0) {
            liqOpp.healthScore = type(uint).max;
            return liqOpp; // no violation
        }

        liqOpp.healthScore = collateralValue * 1e18 / liabilityValue;

        if (collateralValue >= liabilityValue) {
            return liqOpp; // no violation
        }

        // At this point healthScore must be < 1 since collateral < liability

        // Compute discount

        {
            uint baseDiscount = 1e18 - liqOpp.healthScore;

            uint supplierBonus = computeSupplierBonus(liqLocs.liquidator, liabilityValue);

            uint discount = baseDiscount * supplierBonus / 1e18;

            if (discount > (baseDiscount + MAXIMUM_SUPPLIER_BONUS)) discount = baseDiscount + MAXIMUM_SUPPLIER_BONUS;
            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            liqOpp.baseDiscount = baseDiscount;
            liqOpp.discount = discount;
            liqOpp.conversionRate = liqLocs.underlyingPrice * 1e18 / liqLocs.collateralPrice * 1e18 / (1e18 - discount);
        }

        // Determine amount to repay to bring user to target health

        AssetConfig storage underlyingConfig = underlyingLookup[liqLocs.underlying];
        AssetConfig storage collateralConfig = underlyingLookup[liqLocs.collateral];

        {
            uint liabilityValueTarget = liabilityValue * TARGET_HEALTH / 1e18;

            // These factors are first converted into standard 1e18-scale fractions, then adjusted as described in the whitepaper:
            uint borrowAdj = TARGET_HEALTH * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor;
            uint collateralAdj = 1e18 * uint(collateralConfig.collateralFactor) / CONFIG_FACTOR_SCALE * 1e18 / (1e18 - liqOpp.discount);

            uint maxRepayInReference;

            if (liabilityValueTarget <= collateralValue) {
                maxRepayInReference = 0;
            } else if (borrowAdj <= collateralAdj) {
                maxRepayInReference = type(uint).max;
            } else {
                maxRepayInReference = (liabilityValueTarget - collateralValue) * 1e18 / (borrowAdj - collateralAdj);
            }

            liqOpp.repay = maxRepayInReference * 1e18 / liqLocs.underlyingPrice;
        }

        // Limit repay to current owed
        // This can happen when there are multiple borrows and liquidating this one won't bring the violator back to solvency

        {
            uint currentOwed = getCurrentOwed(underlyingAssetStorage, underlyingAssetCache, liqLocs.violator);
            if (liqOpp.repay > currentOwed) liqOpp.repay = currentOwed;
        }

        // Limit yield to borrower's available collateral, and reduce repay if necessary
        // This can happen when borrower has multiple collaterals and seizing all of this one won't bring the violator back to solvency

        liqOpp.yield = liqOpp.repay * liqLocs.conversionRate / 1e18;

        {
            uint collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[liqLocs.violator].balance);

            if (collateralBalance < liqOpp.yield) {
                liqOpp.repay = collateralBalance * 1e18 / liqLocs.conversionRate;
                liqOpp.yield = collateralBalance;
            }
        }
    }

    // Returns 1e18-scale fraction > 1 representing how much faster the bonus grows for this liquidator

    function computeSupplierBonus(address liquidator, uint violatorLiabilityValue) private returns (uint) {
        uint bonus = getUpdatedAverageLiquidity(liquidator) * 1e18 / violatorLiabilityValue;
        if (bonus > 1e18) bonus = 1e18;

        bonus = bonus * (SUPPLIER_BONUS_SLOPE - 1e18) / 1e18;

        return bonus + 1e18;
    }


    function liquidation(address violator, address underlying, address collateral, uint repay, uint minYield) external nonReentrant {
        address liquidator = unpackTrailingParamMsgSender();

        require(!isSubAccountOf(violator, liquidator), "e/liq/self-liquidation");
        require(!accountLookup[violator].liquidityCheckInProgress, "e/liq/violator-liquidity-deferred");
        require(isEnteredInMarket(violator, underlying), "e/liq/violator-not-entered");

        updateAverageLiquidity(liquidator);
        updateAverageLiquidity(violator);

        ILiquidation.LiquidationOpportunity memory liqOpp = checkLiquidation(liquidator, violator, underlying, collateral);

        if (repay == 0) return;
        require(repay <= liqOpp.repay, "e/liq/excessive-repay-amount");

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(collateral, collateralAssetStorage);

        uint yield = repay * liqOpp.conversionRate / 1e18;
        require(yield >= minYield, "e/liq/min-yield");

        // Liquidator takes on violator's debt:

        transferBorrow(underlyingAssetStorage, underlyingAssetCache, eTokenLookup[underlyingLookup[underlyingAssetCache.underlying].eTokenAddress].dTokenAddress, violator, liquidator, repay);

        // In exchange, liquidator gets violator's collateral:

        transferBalance(collateralAssetStorage, collateralAssetCache, underlyingLookup[collateralAssetCache.underlying].eTokenAddress, violator, liquidator, balanceFromUnderlyingAmount(collateralAssetCache, yield));

        // Since liquidator is taking on new debt, liquidity must be checked:

        checkLiquidity(liquidator);

        logAssetStatus(underlyingAssetCache);
        logAssetStatus(collateralAssetCache);
    }
}
