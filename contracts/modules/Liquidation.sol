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

        LiquidationOpportunity liqOpp;

        uint repayPreFees;
    }

    function computeLiqOpp(LiquidationLocals memory liqLocs) private {
        require(!isSubAccountOf(liqLocs.violator, liqLocs.liquidator), "e/liq/self-liquidation");
        require(isEnteredInMarket(liqLocs.violator, liqLocs.collateral), "e/liq/violator-not-entered-collateral");

        uint collateralValue;
        uint liabilityValue;

        {
            bool invalid;
            (collateralValue, liabilityValue, invalid) = getAccountLiquidity(liqLocs.violator);
            require(!invalid, "e/liq/invalid-state");
        }

        LiquidationOpportunity memory liqOpp = liqLocs.liqOpp;
        liqOpp.repay = liqOpp.yield = 0;

        if (liabilityValue == 0) {
            liqLocs.underlying = address(0);
            liqOpp.healthScore = type(uint).max;
            return; // no violation
        }

        liqLocs.underlying = marketsBorrowed[liqLocs.violator][0];
        liqOpp.healthScore = collateralValue * 1e18 / liabilityValue;

        if (collateralValue >= liabilityValue) {
            return; // no violation
        }

        uint underlyingPrice = getAssetPrice(liqLocs.underlying);
        uint collateralPrice = getAssetPrice(liqLocs.collateral);


        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);


        // At this point healthScore must be < 1 since collateral < liability

        // Resolve collateral factor

        // TODO move to helper with liquidation
        uint collateralFactor;
        {
            AssetConfig memory underlyingConfig = resolveAssetConfig(liqLocs.underlying);
            AssetConfig memory collateralConfig = resolveAssetConfig(liqLocs.collateral);
            OverrideConfig memory overrideConfig = overrideLookup[liqLocs.underlying][liqLocs.collateral];
            if (overrideConfig.enabled) {
                collateralFactor = overrideConfig.collateralFactor;
            } else {
                collateralFactor = collateralConfig.collateralFactor * underlyingConfig.borrowFactor / CONFIG_FACTOR_SCALE;
            }
        }

        // Compute discount

        {
            uint baseDiscount = UNDERLYING_RESERVES_FEE + (1e18 - liqOpp.healthScore);

            uint discountBooster = computeDiscountBooster(liqLocs.liquidator, liabilityValue);

            uint discount = baseDiscount * discountBooster / 1e18;

            if (discount > (baseDiscount + MAXIMUM_BOOSTER_DISCOUNT)) discount = baseDiscount + MAXIMUM_BOOSTER_DISCOUNT;
            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            liqOpp.baseDiscount = baseDiscount;
            liqOpp.discount = discount;
            liqOpp.conversionRate = underlyingPrice * 1e18 / collateralPrice * 1e18 / (1e18 - discount);
        }

        // Determine amount to repay to bring user to target health

        {
            uint liabilityValueTarget = liabilityValue * TARGET_HEALTH / 1e18;

            // This factor is first converted into a standard 1e18-scale fraction, then adjusted according to the discount:
            uint collateralAdj = 1e18 * uint(collateralFactor) / CONFIG_FACTOR_SCALE * 1e18 / (1e18 - liqOpp.discount);

            if (TARGET_HEALTH <= collateralAdj) {
                liqOpp.repay = type(uint).max;
            } else {
                // liabilityValueTarget >= liabilityValue > collateralValue
                uint maxRepayInReference = (liabilityValueTarget - collateralValue) * 1e18 / (TARGET_HEALTH - collateralAdj);
                liqOpp.repay = maxRepayInReference * 1e18 / underlyingPrice;
            }
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

        // Adjust repay to account for reserves fee

        liqLocs.repayPreFees = liqOpp.repay;
        liqOpp.repay = liqOpp.repay * (1e18 + UNDERLYING_RESERVES_FEE) / 1e18;
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
    /// @param collateral Token that is to be seized
    /// @return liqOpp The details about the liquidation opportunity
    function checkLiquidation(address liquidator, address violator, address collateral) external nonReentrant returns (LiquidationOpportunity memory liqOpp) {
        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);

        return liqLocs.liqOpp;
    }


    /// @notice Attempts to perform a liquidation
    /// @param violator Address that may be in collateral violation
    /// @param collateral Token that is to be seized
    /// @param repay The amount of underlying DTokens to be transferred from violator to sender, in units of underlying
    /// @param minYield The minimum acceptable amount of collateral ETokens to be transferred from violator to sender, in units of collateral
    function liquidate(address violator, address collateral, uint repay, uint minYield) external nonReentrant {
        require(accountLookup[violator].deferLiquidityStatus == DEFERLIQUIDITY__NONE, "e/liq/violator-liquidity-deferred");

        address liquidator = unpackTrailingParamMsgSender();

        emit RequestLiquidate(liquidator, violator, collateral, repay, minYield);

        updateAverageLiquidity(liquidator);
        updateAverageLiquidity(violator);


        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);


        executeLiquidation(liqLocs, repay, minYield);
    }

    function executeLiquidation(LiquidationLocals memory liqLocs, uint desiredRepay, uint minYield) private {
        // TODO verify why desiredRepay = 0 was allowed?
        require(liqLocs.underlying != address(0), "e/liq/no-liability");
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
