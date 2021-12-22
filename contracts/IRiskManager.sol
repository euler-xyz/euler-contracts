// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./Storage.sol";

// This interface is used to avoid a circular dependency between BaseLogic and RiskManager

interface IRiskManager {
    struct NewMarketParameters {
        uint16 pricingType;
        uint32 pricingParameters;

        Storage.AssetConfig config;
    }

    struct LiquidityStatus {
        uint collateralValue;
        uint liabilityValue;
        uint numBorrows;
        bool borrowIsolated;
    }

    struct AssetLiquidity {
        address underlying;
        LiquidityStatus status;
    }

    function getNewMarketParameters(address underlying) external returns (NewMarketParameters memory);

    function requireLiquidity(address account) external view;
    function computeLiquidity(address account) external view returns (LiquidityStatus memory status);
    function computeAssetLiquidities(address account) external view returns (AssetLiquidity[] memory assets);

    function getPrice(address underlying) external view returns (uint twap, uint twapPeriod);
    function getPriceFull(address underlying) external view returns (uint twap, uint twapPeriod, uint currPrice);
}
