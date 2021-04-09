// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Liquidation is BaseLogic {
    constructor() BaseLogic(MODULEID__LIQUIDATION) {}

    struct LiquidateLocals {
        address liquidator;
        address violator;
        address underlying;
        address collateral;

        uint underlyingPrice;
        uint collateralPrice;

        uint healthScore;
        uint discount;
        uint conversionRate;

        uint repayAmount;
        uint yield;
    }

    function liquidate(address violator, address underlying, address collateral) external {
        address msgSender = unpackTrailingParamMsgSender();

        require(!isSubAccountOf(violator, msgSender), "e/liq/self-liquidation");

        LiquidateLocals memory locs;

        locs.liquidator = msgSender;
        locs.violator = violator;
        locs.underlying = underlying;
        locs.collateral = collateral;

        locs.underlyingPrice = getAssetPrice(underlying);
        locs.collateralPrice = getAssetPrice(underlying);

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(collateral, collateralAssetStorage);

        computeRepayAmount(underlyingAssetStorage, underlyingAssetCache, collateralAssetStorage, collateralAssetCache, locs);

        // Liquidator takes on violator's debt:

        transferBorrow(underlyingAssetStorage, underlyingAssetCache, locs.violator, locs.liquidator, locs.repayAmount);
        emitViaProxy_Transfer(underlyingAssetCache.underlying, locs.violator, locs.liquidator, locs.repayAmount);

        // In exchange, liquidator gets some of violator's collateral:

        uint collateralAmountInternal = balanceFromUnderlyingAmount(collateralAssetCache, locs.yield);
        transferBalance(collateralAssetStorage, locs.violator, locs.liquidator, collateralAmountInternal);
        emitViaProxy_Transfer(collateralAssetCache.underlying, locs.violator, locs.liquidator, collateralAmountInternal);

        // Since liquidator is taking on new debt, liquidity is checked:

        checkLiquidity(locs.liquidator);
    }


    function computeRepayAmount(AssetStorage storage underlyingAssetStorage, AssetCache memory underlyingAssetCache,
                                AssetStorage storage collateralAssetStorage, AssetCache memory collateralAssetCache,
                                LiquidateLocals memory locs) private {
        uint collateralValue;
        uint liabilityValue;

        {
            bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                     abi.encodeWithSelector(IRiskManager.computeLiquidity.selector, locs.violator));
            (IRiskManager.LiquidityStatus memory status) = abi.decode(result, (IRiskManager.LiquidityStatus));

            collateralValue = status.collateralValue;
            liabilityValue = status.liabilityValue;
        }

        require(liabilityValue > collateralValue, "e/liq/no-violation"); // also ensures liabilityValue > 0

        locs.healthScore = collateralValue * 1e18 / liabilityValue; // will be < 1 since liability > collateral

        // Compute discount

        {
            uint discount = 1e18 - locs.healthScore;

            if (isProvider(locs.liquidator, locs.underlying)) discount += LIQUIDATION_DISCOUNT_UNDERLYING_PROVIDER;
            if (isProvider(locs.liquidator, locs.collateral)) discount += LIQUIDATION_DISCOUNT_COLLATERAL_PROVIDER;

            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            locs.discount = discount;
            locs.conversionRate = locs.collateralPrice * 1e18 / locs.underlyingPrice * 1e18 / (1e18 - locs.discount);
        }

        // Determine maximum amount to repay to bring user to target health

        uint maxRepay;

        AssetConfig storage underlyingConfig = underlyingLookup[locs.underlying];
        AssetConfig storage collateralConfig = underlyingLookup[locs.collateral];

        {
            uint borrowAdj = POST_LIQUIDATION_TARGET_HEALTH * 1e18 / underlyingConfig.borrowFactor;
            uint collateralAdj = collateralConfig.collateralFactor * 1e18 / (1e18 - locs.discount);

            if (collateralAdj >= borrowAdj) {
                maxRepay = type(uint).max;
            } else {
                maxRepay = (collateralValue * POST_LIQUIDATION_TARGET_HEALTH / 1e18) - liabilityValue;
                maxRepay = maxRepay * 1e18 / (borrowAdj - collateralAdj);
            }
        }

        // Limit maxRepay to current owed

        {
            uint currentOwed = getCurrentOwed(underlyingAssetStorage, underlyingAssetCache, locs.violator) / INTERNAL_DEBT_PRECISION;
            if (maxRepay > currentOwed) maxRepay = currentOwed;
        }

        // Limit maxRepay to borrower's available collateral

        uint yield = maxRepay * locs.conversionRate / 1e18;

        {
            uint collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[locs.violator].balance);

            if (collateralBalance < yield) {
                maxRepay = collateralBalance * 1e18 / locs.conversionRate;
                yield = collateralBalance;
            }
        }

        // Invoke liquidator's callback to determine how much to repay

        ILiquidator.LiquidationParams memory params = ILiquidator.LiquidationParams({
            underlying: locs.underlying,
            collateral: locs.collateral,
            maxRepay: maxRepay,
            yield: yield,
            collateralPoolSize: collateralAssetCache.poolSize
        });

        uint repayAmount = ILiquidator(locs.liquidator).getLiquidationAmount(params);

        require(repayAmount <= maxRepay, "e/liq/excessive-repay-amount");
        require(repayAmount > 0, "e/liq/zero-repay");

        yield = repayAmount * locs.conversionRate / 1e18;

        locs.repayAmount = repayAmount;
        locs.yield = yield;
    }

    function getAssetPrice(address asset) private returns (uint) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPrice.selector, asset));
        return abi.decode(result, (uint));
    }

    function isProvider(address user, address asset) private view returns (bool) {
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[asset].eTokenAddress];

        // A provider is somebody with a non-zero EToken balance, and an interestAccumulator value
        // from the past, meaning they have held this EToken balance for at least one block.

        if (assetStorage.users[user].balance == 0) return false;

        if (assetStorage.users[user].interestAccumulator == assetStorage.interestAccumulator) return false;

        return true;
    }
}
