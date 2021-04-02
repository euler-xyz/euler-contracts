// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";
import "../vendor/TickMath.sol";


contract RiskManager is BaseLogic {
    // Construction

    address immutable referenceAsset;
    address immutable uniswapFactory;
    bytes32 immutable uniswapPoolInitCodeHash;

    struct RiskManagerSettings {
        address referenceAsset;
        address uniswapFactory;
        bytes32 uniswapPoolInitCodeHash;
    }

    constructor(RiskManagerSettings memory settings) BaseLogic(MODULEID__RISK_MANAGER) {
        referenceAsset = settings.referenceAsset;
        uniswapFactory = settings.uniswapFactory;
        uniswapPoolInitCodeHash = settings.uniswapPoolInitCodeHash;
    }


    // Default market parameters

    function getNewMarketParameters(address underlying) external returns (IRiskManager.NewMarketParameters memory p) {
        if (underlying == referenceAsset) {
            // 1:1 peg

            p.pricingType = PRICINGTYPE_PEGGED;
            p.pricingParameters = bytes12(uint96(1e18));
        } else {
            // Uniswap3 TWAP

            // FIXME: determine which pool fee-level to use based on liquidity?
            uint24 fee;
            if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 500) != address(0)) fee = 500;
            else if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 3000) != address(0)) fee = 3000;
            else if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 10000) != address(0)) fee = 10000;
            else revert("e/no-uniswap-pool-avail");

            p.pricingType = PRICINGTYPE_UNISWAP3_TWAP;
            p.pricingParameters = bytes12(uint96(fee));

            // FIXME: require that this address is equal to that returned by getPool above
            address pool = computeUniswapPoolAddress(underlying, fee);

            IUniswapV3Pool(pool).increaseObservationCardinalityNext(10);
        }

        p.config.borrowIsolated = true;
        p.config.collateralFactor = uint32(CONFIG_FACTOR_SCALE * 3 / 4);
        p.config.borrowFactor = uint32(CONFIG_FACTOR_SCALE * 4 / 10);
        p.config.twapWindow = 30 * 60;
    }



    // Pricing

    function computeUniswapPoolAddress(address underlying, uint24 fee) private view returns (address) {
        address tokenA = underlying;
        address tokenB = referenceAsset;
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        return address(uint160(uint256(keccak256(abi.encodePacked(
                   hex'ff',
                   uniswapFactory,
                   keccak256(abi.encode(tokenA, tokenB, fee)),
                   uniswapPoolInitCodeHash
               )))));
    }

    function decodeSqrtPriceX96(address underlying, uint160 sqrtPriceX96) private view returns (uint price) {
        uint priceX96 = uint(sqrtPriceX96) * uint(sqrtPriceX96);

        price = priceX96 / (uint(2**(96*2)) / 1e18);

        if (uint160(underlying) < uint160(referenceAsset)) price = (1e18 * 1e18) / price;
    }

    function getOldestPriceInternal(address pool) private returns (uint, uint) {
        (,, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext,,) = IUniswapV3Pool(pool).slot0();

        // FIXME: finish this
    }

    function getPriceInternal(address underlying, AssetCache memory assetCache, AssetConfig memory config) private FREEMEM returns (uint, uint) {
        if (assetCache.pricingType == PRICINGTYPE_PEGGED) {
            uint price = uint(uint96(assetCache.pricingParameters));
            return (price, config.twapWindow);
        } else if (assetCache.pricingType == PRICINGTYPE_UNISWAP3_TWAP) {
            address pool = computeUniswapPoolAddress(underlying, uint24(uint96(assetCache.pricingParameters)));

            uint32[] memory secondsAgos = new uint32[](2);
            secondsAgos[0] = config.twapWindow;
            secondsAgos[1] = 0;

            int56[] memory tickCumulatives;

            (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.observe.selector, secondsAgos));

            if (!success) {
                // FIXME: finish this, handle "OLD" error
                /*
                if (keccak256(abi.encodePacked(data)) == keccak256(abi.encodePacked("OLD"))) {
                    (uint oldestAvailPrice, uint twapPeriod) = getOldestPriceInternal(pool);
                    //FIXME: finish this
                    return (0, 0);
                }
                */
                return (0, 0);
            }

            // If call failed because uniswap pool doesn't exist, then this decode will throw:

            tickCumulatives = abi.decode(data, (int56[])); // don't bother decoding the liquidityCumulatives array

            int24 tick = int24((tickCumulatives[0] - tickCumulatives[1]) / int56(int(uint(config.twapWindow))));

            uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

            return (decodeSqrtPriceX96(underlying, sqrtPriceX96), config.twapWindow);
        } else {
            revert("e/unknown-pricing-type");
        }
    }

    function getPrice(address underlying) external returns (uint twap, uint twapPeriod, uint currPrice) {
        AssetConfig memory config = underlyingLookup[underlying];
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        (twap, twapPeriod) = getPriceInternal(underlying, assetCache, config);

        if (assetCache.pricingType == PRICINGTYPE_PEGGED) {
            currPrice = 1e18;
        } else if (assetCache.pricingType == PRICINGTYPE_UNISWAP3_TWAP) {
            address pool = computeUniswapPoolAddress(underlying, uint24(uint96(assetCache.pricingParameters)));
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
            currPrice = decodeSqrtPriceX96(underlying, sqrtPriceX96);
        }
    }


    // Liquidity

    function computeLiquidityRaw(address account, address[] memory underlyings) private returns (IRiskManager.LiquidityStatus memory status) {
        status.collateralValue = 0;
        status.liabilityValue = 0;
        status.numBorrows = 0;
        status.borrowIsolated = false;

        AssetConfig memory config;
        AssetStorage storage assetStorage;
        AssetCache memory assetCache;

        for (uint i = 0; i < underlyings.length; i++) {
            uint price;

            {
                address underlying = underlyings[i];
                config = underlyingLookup[underlying];
                assetStorage = eTokenLookup[config.eTokenAddress];
                assetCache = loadAssetCache(underlying, assetStorage); // FIXME gas: overwrite existing assetCache memory instead of allocating?
                (price,) = getPriceInternal(underlying, assetCache, config);
            }

            if (config.collateralFactor != 0) {
                uint assetCollateral = balanceToUnderlyingAmount(assetCache, assetStorage.users[account].balance);

                if (assetCollateral > 0) {
                    assetCollateral = assetCollateral * price / 1e18;
                    assetCollateral = assetCollateral * config.collateralFactor / CONFIG_FACTOR_SCALE;
                    require(assetCollateral <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded"); // FIXME: saturate to prevent account bricking
                    status.collateralValue += assetCollateral;
                }
            }

            {
                uint assetLiability = getCurrentOwed(assetStorage, assetCache, account) / INTERNAL_DEBT_PRECISION;

                if (assetLiability > 0) {
                    status.numBorrows++;
                    if (config.borrowIsolated) status.borrowIsolated = true;

                    assetLiability = assetLiability * price / 1e18;
                    assetLiability = assetLiability * CONFIG_FACTOR_SCALE / config.borrowFactor;
                    require(assetLiability <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded"); // FIXME: saturate to prevent account bricking
                    status.liabilityValue += assetLiability;
                }
            }
        }
    }

    function computeLiquidity(address account) public returns (IRiskManager.LiquidityStatus memory) {
        return computeLiquidityRaw(account, getEnteredMarketsArray(account));
    }

    function computeAssetLiquidities(address account) external returns (IRiskManager.AssetLiquidity[] memory) {
        address[] memory underlyings = getEnteredMarketsArray(account);

        IRiskManager.AssetLiquidity[] memory output = new IRiskManager.AssetLiquidity[](underlyings.length);

        address[] memory singleUnderlying = new address[](1);

        for (uint i = 0; i < underlyings.length; i++) {
            output[i].underlying = singleUnderlying[0] = underlyings[i];
            output[i].status = computeLiquidityRaw(account, singleUnderlying);
        }

        return output;
    }

    function requireLiquidity(address account) external {
        IRiskManager.LiquidityStatus memory status = computeLiquidity(account);

        require(!status.borrowIsolated || status.numBorrows == 1, "e/borrow-isolation-violation");
        require(status.collateralValue >= status.liabilityValue, "e/collateral-violation");
    }
}
