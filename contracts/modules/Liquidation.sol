// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


/// @notice Liquidate users who are in collateral violation to protect lenders
contract Liquidation is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__LIQUIDATION, moduleGitCommit_) {}

    // How much of a liquidation is credited to the underlying's reserves.
    uint public constant UNDERLYING_RESERVES_FEE = 0.02 * 1e18;

    // Maximum discount that can be awarded under any conditions.
    uint public constant MAXIMUM_DISCOUNT = 0.20 * 1e18;

    // How much faster the booster grows for a fully funded supplier. Partially-funded suppliers
    // have this scaled proportional to their free-liquidity divided by the violator's liability.
    uint public constant DISCOUNT_BOOSTER_SLOPE = 2 * 1e18;

    // How much booster discount can be awarded beyond the base discount.
    uint public constant MAXIMUM_BOOSTER_DISCOUNT = 0.025 * 1e18;

    // Post-liquidation target health score that limits maximum liquidation sizes. Must be >= 1.
    uint public constant TARGET_HEALTH = 1.25 * 1e18;


    /// @notice Information about a prospective liquidation opportunity
    struct LiquidationOpportunity {
        uint repay;
        uint yield;
        uint healthScore;

        // Only populated if repay > 0:
        uint baseDiscount;
        uint discount;
        uint conversionRate;
    }

    struct LiquidationLocals {
        address liquidator;
        address violator;
        address underlying;
        address collateral;

        uint underlyingPrice;
        uint collateralPrice;

        uint collateralValue;
        uint overrideCollateralValue;
        uint liabilityValue;

        uint currentOwed;
        uint collateralBalance;

        LiquidationOpportunity liqOpp;

        uint repayPreFees;
    }

    function computeLiqOpp(LiquidationLocals memory liqLocs) private {
        require(!isSubAccountOf(liqLocs.violator, liqLocs.liquidator), "e/liq/self-liquidation");
        require(isEnteredInMarket(liqLocs.violator, liqLocs.underlying), "e/liq/violator-not-entered-underlying");
        require(isEnteredInMarket(liqLocs.violator, liqLocs.collateral), "e/liq/violator-not-entered-collateral");

        liqLocs.underlyingPrice = getAssetPrice(liqLocs.underlying);
        liqLocs.collateralPrice = getAssetPrice(liqLocs.collateral);

        {
            AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
            AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);
            liqLocs.currentOwed = getCurrentOwed(underlyingAssetStorage, underlyingAssetCache, liqLocs.violator);


            AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
            AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);
            liqLocs.collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[liqLocs.violator].balance);

            (uint collateralValue, uint liabilityValue, uint overrideCollateralValue) = getAccountLiquidity(liqLocs.violator);
            liqLocs.collateralValue = collateralValue;
            liqLocs.liabilityValue = liabilityValue;
            liqLocs.overrideCollateralValue = overrideCollateralValue;
        }

        LiquidationOpportunity memory liqOpp = liqLocs.liqOpp;

        liqOpp.repay = liqOpp.yield = 0;


        if (liqLocs.liabilityValue == 0) {
            liqOpp.healthScore = type(uint).max;
            return; // no violation
        }

        liqOpp.healthScore = liqLocs.collateralValue * 1e18 / liqLocs.liabilityValue;

        if (liqLocs.collateralValue >= liqLocs.liabilityValue) {
            return; // no violation
        }

        // At this point healthScore must be < 1 since collateral < liability

        // Compute discount

        {
            uint baseDiscount = UNDERLYING_RESERVES_FEE + (1e18 - liqOpp.healthScore);

            uint discountBooster = computeDiscountBooster(liqLocs.liquidator, liqLocs.liabilityValue);

            uint discount = baseDiscount * discountBooster / 1e18;

            if (discount > (baseDiscount + MAXIMUM_BOOSTER_DISCOUNT)) discount = baseDiscount + MAXIMUM_BOOSTER_DISCOUNT;
            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            liqOpp.baseDiscount = baseDiscount;
            liqOpp.discount = discount;

            liqOpp.conversionRate = liqLocs.underlyingPrice * 1e18 / liqLocs.collateralPrice * 1e18 / (1e18 - discount);
        }

        // Determine amount to repay to bring user to target health

        OverrideConfig memory overrideConfig;
        AssetConfig memory collateralConfig;
        AssetConfig memory underlyingConfig;
        if (liqLocs.underlying == liqLocs.collateral) {
            liqOpp.repay = type(uint).max;
        } else {
            collateralConfig = resolveAssetConfig(liqLocs.collateral);
            underlyingConfig = resolveAssetConfig(liqLocs.underlying);

            uint collateralFactor = collateralConfig.collateralFactor;
            uint borrowFactor = underlyingConfig.borrowFactor;
    
            if (liqLocs.overrideCollateralValue > 0) {
                overrideConfig = overrideLookup[liqLocs.underlying][liqLocs.collateral];
            }

            // If override is active, assume the resulting liability will be fully covered by override collateral
            if (overrideConfig.enabled) { // the liquidated collateral is an override
                collateralFactor = overrideConfig.collateralFactor;
                borrowFactor = CONFIG_FACTOR_SCALE;

                // adjust the whole liability for override BF = 1
                liqLocs.liabilityValue = liqLocs.currentOwed * liqLocs.underlyingPrice / 1e18;
            } 

            // Calculate for no overrides or resulting liability fully covered by override
            // or if liquidating non-override collateral assume result will be partially covered by override
            calculateRepayCommon(liqOpp, liqLocs, collateralFactor, borrowFactor);
        }

        // Limit repay and yield to current debt and available collateral 
        boundRepayAndYield(liqOpp, liqLocs);

        // Test the assumptions and adjust if needed

        // Correction when liquidating override collateral
        if (
            // Override and regular collateral, liquidating collateral
            overrideConfig.enabled && liqLocs.overrideCollateralValue != liqLocs.collateralValue &&
            // not already maxed out
            liqOpp.yield != liqLocs.collateralBalance &&
            // result is not fully covered by override collateral as expected 
            (liqOpp.repay == 0 || // numerator in equation was negative
                (liqLocs.currentOwed - liqOpp.repay) * liqLocs.underlyingPrice / 1e18 > 
                liqLocs.overrideCollateralValue - liqOpp.yield * overrideConfig.collateralFactor / CONFIG_FACTOR_SCALE * liqLocs.collateralPrice / 1e18)
        ) {
            uint auxAdj = 1e18 * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor  - 1e18;
            uint borrowAdj = underlyingConfig.borrowFactor != 0 ? TARGET_HEALTH * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor : MAX_SANE_DEBT_AMOUNT;
            uint collateralAdj = 1e18 * uint(overrideConfig.collateralFactor) / CONFIG_FACTOR_SCALE * (TARGET_HEALTH * auxAdj / 1e18 + 1e18) / (1e18 - liqOpp.discount);

            uint overrideCollateralValueAdj = liqLocs.overrideCollateralValue  * auxAdj / 1e18;
            uint liabilityValueAdj = liqLocs.currentOwed * liqLocs.underlyingPrice / 1e18 * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor;

            if (liabilityValueAdj < overrideCollateralValueAdj || borrowAdj <= collateralAdj) {
                liqOpp.repay = type(uint).max;
            } else {
                liabilityValueAdj = liabilityValueAdj - overrideCollateralValueAdj;
                liabilityValueAdj = TARGET_HEALTH * liabilityValueAdj / 1e18;

                liqOpp.repay = liabilityValueAdj > liqLocs.collateralValue
                    ? (liabilityValueAdj - liqLocs.collateralValue) * 1e18 / (borrowAdj - collateralAdj) * 1e18 / liqLocs.underlyingPrice
                    : type(uint).max;
            }

            boundRepayAndYield(liqOpp, liqLocs);
        }

        // Correction when liquidating regular collateral with overrides present
        if (
            // liquidating regular collateral, override present 
            !overrideConfig.enabled && liqLocs.overrideCollateralValue > 0 &&
            // not already maxed out
            liqOpp.yield != liqLocs.collateralBalance &&
            // result is not partially collateralised as expected
            (liqLocs.currentOwed - liqOpp.repay) * liqLocs.underlyingPrice / 1e18 < liqLocs.overrideCollateralValue
        ) {
            // adjust the whole liability for override BF = 1
            liqLocs.liabilityValue = liqLocs.currentOwed * liqLocs.underlyingPrice / 1e18;
            calculateRepayCommon(liqOpp, liqLocs, collateralConfig.collateralFactor, CONFIG_FACTOR_SCALE);

            liqOpp.repay = liqOpp.repay == 0 ? type(uint).max : liqOpp.repay;

            boundRepayAndYield(liqOpp, liqLocs);
        }

        // Adjust repay to account for reserves fee

        liqLocs.repayPreFees = liqOpp.repay;
        liqOpp.repay = liqOpp.repay * (1e18 + UNDERLYING_RESERVES_FEE) / 1e18;
    }

    function calculateRepayCommon(LiquidationOpportunity memory liqOpp, LiquidationLocals memory liqLocs, uint collateralFactor, uint borrowFactor) private pure {
        // These factors are first converted into standard 1e18-scale fractions, then adjusted according to TARGET_HEALTH and the discount:
        uint borrowAdj = borrowFactor != 0 ? TARGET_HEALTH * CONFIG_FACTOR_SCALE / borrowFactor : MAX_SANE_DEBT_AMOUNT;
        uint collateralAdj = 1e18 * collateralFactor / CONFIG_FACTOR_SCALE * 1e18 / (1e18 - liqOpp.discount);
        uint liabilityValue = liqLocs.liabilityValue * TARGET_HEALTH / 1e18;

        if (liabilityValue > liqLocs.collateralValue) { // TODO L < 0
            if (borrowAdj <= collateralAdj) {
                liqOpp.repay = type(uint).max;
            } else {
                uint maxRepayInReference = (liabilityValue - liqLocs.collateralValue) * 1e18 / (borrowAdj - collateralAdj);
                liqOpp.repay = maxRepayInReference * 1e18 / liqLocs.underlyingPrice;
            }
        }
    }

    function boundRepayAndYield(LiquidationOpportunity memory liqOpp, LiquidationLocals memory liqLocs) private pure {
        // Limit repay to current owed
        // This can happen when there are multiple borrows and liquidating this one won't bring the violator back to solvency

        if (liqOpp.repay > liqLocs.currentOwed) {
            liqOpp.repay = liqLocs.currentOwed;
        }

        // Limit yield to borrower's available collateral, and reduce repay if necessary
        // This can happen when borrower has multiple collaterals and seizing all of this one won't bring the violator back to solvency

        liqOpp.yield = liqOpp.repay * liqOpp.conversionRate / 1e18;

        if (liqLocs.collateralBalance < liqOpp.yield) {
            liqOpp.repay = liqLocs.collateralBalance * 1e18 / liqOpp.conversionRate;
            liqOpp.yield = liqLocs.collateralBalance;
        }
    }


    // Returns 1e18-scale fraction > 1 representing how much faster the booster grows for this liquidator

    function computeDiscountBooster(address liquidator, uint violatorLiabilityValue) private returns (uint) {
        uint booster = getUpdatedAverageLiquidityWithDelegate(liquidator) * 1e18 / violatorLiabilityValue;
        if (booster > 1e18) booster = 1e18;

        booster = booster * (DISCOUNT_BOOSTER_SLOPE - 1e18) / 1e18;

        return booster + 1e18;
    }


    /// @notice Checks to see if a liquidation would be profitable, without actually doing anything
    /// @param liquidator Address that will initiate the liquidation
    /// @param violator Address that may be in collateral violation
    /// @param underlying Token that is to be repayed
    /// @param collateral Token that is to be seized
    /// @return liqOpp The details about the liquidation opportunity
    function checkLiquidation(address liquidator, address violator, address underlying, address collateral) external nonReentrant returns (LiquidationOpportunity memory liqOpp) {
        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.underlying = underlying;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);

        return liqLocs.liqOpp;
    }


    /// @notice Attempts to perform a liquidation
    /// @param violator Address that may be in collateral violation
    /// @param underlying Token that is to be repayed
    /// @param collateral Token that is to be seized
    /// @param repay The amount of underlying DTokens to be transferred from violator to sender, in units of underlying
    /// @param minYield The minimum acceptable amount of collateral ETokens to be transferred from violator to sender, in units of collateral
    function liquidate(address violator, address underlying, address collateral, uint repay, uint minYield) external nonReentrant {
        require(accountLookup[violator].deferLiquidityStatus == DEFERLIQUIDITY__NONE, "e/liq/violator-liquidity-deferred");

        address liquidator = unpackTrailingParamMsgSender();

        emit RequestLiquidate(liquidator, violator, underlying, collateral, repay, minYield);

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

    function executeLiquidation(LiquidationLocals memory liqLocs, uint desiredRepay, uint minYield) private {
        require(desiredRepay <= liqLocs.liqOpp.repay, "e/liq/excessive-repay-amount");


        uint repay;

        {
            AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
            AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

            if (desiredRepay == liqLocs.liqOpp.repay) repay = liqLocs.repayPreFees;
            else repay = desiredRepay * (1e18 * 1e18 / (1e18 + UNDERLYING_RESERVES_FEE)) / 1e18;

            {
                uint repayExtra = desiredRepay - repay;

                // Liquidator takes on violator's debt:

                transferBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.violator, liqLocs.liquidator, repay);

                // Extra debt is minted and assigned to liquidator:

                increaseBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.liquidator, repayExtra);

                // The underlying's reserve is credited to compensate for this extra debt:

                {
                    uint poolAssets = underlyingAssetCache.poolSize + (underlyingAssetCache.totalBorrows / INTERNAL_DEBT_PRECISION);
                    uint newTotalBalances = poolAssets * underlyingAssetCache.totalBalances / (poolAssets - repayExtra);
                    increaseReserves(underlyingAssetStorage, underlyingAssetCache, newTotalBalances - underlyingAssetCache.totalBalances);
                }
            }

            logAssetStatus(underlyingAssetCache);
        }


        uint yield;

        {
            AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
            AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);

            yield = repay * liqLocs.liqOpp.conversionRate / 1e18;
            require(yield >= minYield, "e/liq/min-yield");

            // Liquidator gets violator's collateral:

            address eTokenAddress = underlyingLookup[collateralAssetCache.underlying].eTokenAddress;

            transferBalance(collateralAssetStorage, collateralAssetCache, eTokenAddress, liqLocs.violator, liqLocs.liquidator, underlyingAmountToBalance(collateralAssetCache, yield));

            logAssetStatus(collateralAssetCache);
        }


        // Since liquidator is taking on new debt, liquidity must be checked:

        checkLiquidity(liqLocs.liquidator);

        emitLiquidationLog(liqLocs, repay, yield);
    }

    function emitLiquidationLog(LiquidationLocals memory liqLocs, uint repay, uint yield) private {
        emit Liquidation(liqLocs.liquidator, liqLocs.violator, liqLocs.underlying, liqLocs.collateral, repay, yield, liqLocs.liqOpp.healthScore, liqLocs.liqOpp.baseDiscount, liqLocs.liqOpp.discount);
    }
}
