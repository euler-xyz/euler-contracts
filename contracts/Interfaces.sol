// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Storage.sol";


interface IERC20 {
    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint);
    function balanceOf(address owner) external view returns (uint);
    function allowance(address owner, address spender) external view returns (uint);

    function approve(address spender, uint value) external returns (bool);
    function transfer(address to, uint value) external returns (bool);
    function transferFrom(address from, address to, uint value) external returns (bool);
}

interface IEToken {
    function totalSupplyUnderlying() external view returns (uint);
    function balanceOfUnderlying(address owner) external view returns (uint);
}

interface IDToken {
    function totalSupplyExact() external view returns (uint);
    function balanceOfExact(address owner) external view returns (uint);
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives);
    function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 liquidityCumulative, bool initialized);
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

struct EulerBatchItem {
    bool allowError;
    address proxyAddr;
    bytes data;
}

struct EulerBatchItemResponse {
    bool success;
    bytes result;
}

interface IEuler {
    function moduleIdToImplementation(uint moduleId) external view returns (address);
    function moduleIdToProxy(uint moduleId) external view returns (address);
}

interface IMarkets {
    function activateMarket(address underlying) external returns (address);

    function underlyingToEToken(address underlying) external view returns (address);
    function underlyingToAssetConfig(address underlying) external view returns (Storage.AssetConfig memory);
    function eTokenToUnderlying(address eToken) external view returns (address);
    function eTokenToDToken(address eToken) external view returns (address);
    function interestRate(address underlying) external view returns (uint);
    function getEnteredMarkets(address account) external view returns (address[] memory markets);
    function pricingParams() external view returns (address, address, address);

    function enterMarket(uint subAccountId, address newMarket) external;
    function exitMarket(uint subAccountId, address oldMarket) external;
}

interface IModule {
    function moduleId() external view returns (uint);
}

interface IIRM {
    function computeInterestRate(address underlying, uint32 utilisation, uint32 prevUtilisation, int96 prevInterestRate, uint deltaT) external returns (int96 newInterestRate);
    function reset(address underlying, bytes calldata resetParams) external;
}

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

    function requireLiquidity(address account) external;
    function computeLiquidity(address account) external returns (LiquidityStatus memory status);
    function computeAssetLiquidities(address account) external returns (AssetLiquidity[] memory assets);

    function getPrice(address underlying) external returns (uint twap, uint twapPeriod);
    function getPriceFull(address underlying) external returns (uint twap, uint twapPeriod, uint currPrice);
}

interface IExec {
    function detailedLiquidity(address account) external returns (IRiskManager.AssetLiquidity[] memory);
    function getPriceFull(address underlying) external returns (uint twap, uint twapPeriod, uint currPrice);
}

interface IDeferredLiquidityCheck {
    function onDeferredLiquidityCheck() external;
}

interface ILiquidation {
    struct LiquidationOpportunity {
        address liquidator;
        address violator;
        address underlying;
        address collateral;

        uint underlyingPrice;
        uint collateralPrice;
        uint underlyingPoolSize;
        uint collateralPoolSize;

        uint repay;
        uint yield;
        uint healthScore;

        // Only populated if repay > 0:
        uint discount;
        uint conversionRate;
    }

    function liquidate(address violator, address underlying, address collateral) external;
}

interface ILiquidator {
    function onLiquidationOffer(ILiquidation.LiquidationOpportunity memory liqOpp) external returns (uint repayDesired);
}
