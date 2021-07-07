// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Liquidation is BaseLogic {
    constructor() BaseLogic(MODULEID__LIQUIDATION) {}

    // How much of a liquidation is credited to the underlying/collateral reserves:

    uint private constant UNDERLYING_RESERVES_FEE = 0.01 * 1e18;
    uint private constant COLLATERAL_RESERVES_FEE = 0.00 * 1e18;

    // Base discount starts at just enough to compensate for the fees:

    uint private constant BASE_DISCOUNT = (1e18 * (1e18 + UNDERLYING_RESERVES_FEE) / (1e18 - COLLATERAL_RESERVES_FEE)) - 1e18;

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

        ILiquidation.LiquidationOpportunity liqOpp;
    }

    function computeLiqOpp(LiquidationLocals memory liqLocs) private {
        liqLocs.underlyingPrice = getAssetPrice(liqLocs.underlying);
        liqLocs.collateralPrice = getAssetPrice(liqLocs.collateral);

        ILiquidation.LiquidationOpportunity memory liqOpp = liqLocs.liqOpp;

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);

        liqOpp.repay = liqOpp.yield = 0;

        (uint collateralValue, uint liabilityValue) = getAccountLiquidity(liqLocs.violator);

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
            uint baseDiscount = BASE_DISCOUNT + 1e18 - liqOpp.healthScore;

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
            collateralAdj = collateralAdj * (1e18 - COLLATERAL_RESERVES_FEE) / 1e18;

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

        liqOpp.yield = liqOpp.repay * liqOpp.conversionRate / 1e18;

        {
            uint collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[liqLocs.violator].balance);

            if (collateralBalance < liqOpp.yield) {
                liqOpp.repay = collateralBalance * 1e18 / liqOpp.conversionRate;
                liqOpp.yield = collateralBalance;
            }
        }

        // Adjust repay and borrow to account for reserves fees

        liqOpp.repay = liqOpp.repay * (1e18 + UNDERLYING_RESERVES_FEE) / 1e18;
        liqOpp.yield = liqOpp.yield * (1e18 - COLLATERAL_RESERVES_FEE) / 1e18;
    }

    // Returns 1e18-scale fraction > 1 representing how much faster the bonus grows for this liquidator

    function computeSupplierBonus(address liquidator, uint violatorLiabilityValue) private returns (uint) {
        uint bonus = getUpdatedAverageLiquidity(liquidator) * 1e18 / violatorLiabilityValue;
        if (bonus > 1e18) bonus = 1e18;

        bonus = bonus * (SUPPLIER_BONUS_SLOPE - 1e18) / 1e18;

        return bonus + 1e18;
    }


    function checkLiquidation(address liquidator, address violator, address underlying, address collateral) external nonReentrant returns (ILiquidation.LiquidationOpportunity memory liqOpp) {
        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.underlying = underlying;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);

        return liqLocs.liqOpp;
    }


    function liquidate(address violator, address underlying, address collateral, uint repay, uint minYield) external nonReentrant {
        address liquidator = unpackTrailingParamMsgSender();

        require(!isSubAccountOf(violator, liquidator), "e/liq/self-liquidation");
        require(!accountLookup[violator].liquidityCheckInProgress, "e/liq/violator-liquidity-deferred");
        require(isEnteredInMarket(violator, underlying), "e/liq/violator-not-entered-underlying");
        require(isEnteredInMarket(violator, collateral), "e/liq/violator-not-entered-collateral");

        updateAverageLiquidity(liquidator);
        updateAverageLiquidity(violator);


        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.underlying = underlying;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);


        executeLiquidation(liqLocs, repay, minYield);
    }

    function executeLiquidation(LiquidationLocals memory liqLocs, uint repay, uint minYield) private {
        if (repay == 0) return;
        require(repay <= liqLocs.liqOpp.repay, "e/liq/excessive-repay-amount");

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);


        uint repayTransfer = repay * (1e18 * 1e18 / (1e18 + UNDERLYING_RESERVES_FEE)) / 1e18;

        // Liquidator takes on violator's debt:

        transferBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.violator, liqLocs.liquidator, repayTransfer);

        // Extra debt is minted and assigned to liquidator:

        increaseBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.liquidator, repay - repayTransfer);

        // The underlying's reserve is credited to compensate for this extra debt:

        {
            uint poolAssets = underlyingAssetCache.poolSize + (underlyingAssetCache.totalBorrows / INTERNAL_DEBT_PRECISION);
            uint newTotalBalances = poolAssets * underlyingAssetCache.totalBalances / (poolAssets - (repay - repayTransfer));
            increaseReserves(underlyingAssetStorage, underlyingAssetCache, newTotalBalances - underlyingAssetCache.totalBalances);
        }



        uint yieldFull = repayTransfer * liqLocs.liqOpp.conversionRate / 1e18;

        uint yield = yieldFull * (1e18 * 1e18 / (1e18 + COLLATERAL_RESERVES_FEE)) / 1e18;
        require(yield >= minYield, "e/liq/min-yield");

        // Liquidator gets violator's collateral:

        address eTokenAddress = underlyingLookup[collateralAssetCache.underlying].eTokenAddress;

        transferBalance(collateralAssetStorage, collateralAssetCache, eTokenAddress, liqLocs.violator, liqLocs.liquidator, balanceFromUnderlyingAmount(collateralAssetCache, yield));

        // Violator burns an amount of collateral as a reserve fee:

        uint yieldFee = balanceFromUnderlyingAmount(collateralAssetCache, yieldFull - yield);

        decreaseBalance(collateralAssetStorage, collateralAssetCache, eTokenAddress, liqLocs.violator, yieldFee);

        // And this fee is credited to the collateral's reserve:

        increaseReserves(collateralAssetStorage, collateralAssetCache, yieldFee);


        // Since liquidator is taking on new debt, liquidity must be checked:

        checkLiquidity(liqLocs.liquidator);

        logAssetStatus(underlyingAssetCache);
        logAssetStatus(collateralAssetCache);
    }
}
