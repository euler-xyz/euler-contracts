// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../IRiskManager.sol";
import "../vendor/TickMath.sol";
import "../vendor/FullMath.sol";



interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives);
    function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 liquidityCumulative, bool initialized);
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}


contract RiskManager is IRiskManager, BaseLogic {
    // Construction

    address immutable referenceAsset; // Token must have 18 decimals
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

    function getNewMarketParameters(address underlying) external override returns (NewMarketParameters memory p) {
        p.config.borrowIsolated = true;
        p.config.collateralFactor = uint32(0);
        p.config.borrowFactor = type(uint32).max;
        p.config.twapWindow = type(uint24).max;

        if (underlying == referenceAsset) {
            // 1:1 peg

            p.pricingType = PRICINGTYPE__PEGGED;
            p.pricingParameters = uint32(0);
        } else if (pTokenLookup[underlying] != address(0)) {
            p.pricingType = PRICINGTYPE__FORWARDED;
            p.pricingParameters = uint32(0);

            p.config.collateralFactor = underlyingLookup[pTokenLookup[underlying]].collateralFactor;
        } else {
            // Uniswap3 TWAP

            // FIXME: determine which pool fee-level to use based on liquidity?
            uint24 fee;
            if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 3000) != address(0)) fee = 3000;
            else if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 500) != address(0)) fee = 500;
            else if (IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, 10000) != address(0)) fee = 10000;
            else revert("e/no-uniswap-pool-avail");

            p.pricingType = PRICINGTYPE__UNISWAP3_TWAP;
            p.pricingParameters = uint32(fee);

            address pool = computeUniswapPoolAddress(underlying, fee);
            require(IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, fee) == pool, "e/bad-uniswap-pool-addr");

            try IUniswapV3Pool(pool).increaseObservationCardinalityNext(MIN_UNISWAP3_OBSERVATION_CARDINALITY) {
                // Success
            } catch Error(string memory err) {
                if (keccak256(bytes(err)) == keccak256("LOK")) revert("e/risk/uniswap-pool-not-inited");
                revert(string(abi.encodePacked("e/risk/uniswap/", err)));
            } catch (bytes memory returnData) {
                revertBytes(returnData);
            }
        }
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


    function decodeSqrtPriceX96(AssetCache memory assetCache, uint sqrtPriceX96) private view returns (uint price) {
        if (uint160(assetCache.underlying) < uint160(referenceAsset)) {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / 1e18) / assetCache.underlyingDecimalsScaler;
        } else {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / (1e18 * assetCache.underlyingDecimalsScaler));
            if (price == 0) return 1e36;
            price = 1e36 / price;
        }

        if (price > 1e36) price = 1e36;
        else if (price == 0) price = 1;
    }

    function callUniswapObserve(AssetCache memory assetCache, address pool, uint ago) private returns (uint, uint) {
        uint32[] memory secondsAgos = new uint32[](2);

        secondsAgos[0] = uint32(ago);
        secondsAgos[1] = 0;

        (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.observe.selector, secondsAgos));

        if (!success) {
            if (keccak256(data) != keccak256(abi.encodeWithSignature("Error(string)", "OLD"))) revertBytes(data);

            // The oldest available observation in the ring buffer is the index following the current (accounting for wrapping),
            // since this is the one that will be overwritten next.

            (,, uint16 index, uint16 cardinality, uint16 cardinalityNext,,) = IUniswapV3Pool(pool).slot0();

            (uint32 oldestAvailableAge,,,bool initialized) = IUniswapV3Pool(pool).observations((index + 1) % cardinality);

            // If the following observation in a ring buffer of our current cardinality is uninitialized, then all the
            // observations at higher indices are also uninitialized, so we wrap back to index 0, which we now know
            // to be the oldest available observation.

            if (!initialized) (oldestAvailableAge,,,) = IUniswapV3Pool(pool).observations(0);

            if (cardinality == cardinalityNext && cardinality < 65535) {
                // Apply negative feedback: If we don't have an observation old enough to satisfy the desired TWAP,
                // then increase the size of the ring buffer so that in the future hopefully we will.

                IUniswapV3Pool(pool).increaseObservationCardinalityNext(cardinality + 1);
            }

            // Call observe() again to get the oldest available

            ago = block.timestamp - oldestAvailableAge;
            secondsAgos[0] = uint32(ago);

            (success, data) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.observe.selector, secondsAgos));
            if (!success) revertBytes(data);
        }

        // If uniswap pool doesn't exist, then data will be empty and this decode will throw:

        int56[] memory tickCumulatives = abi.decode(data, (int56[])); // don't bother decoding the liquidityCumulatives array

        int24 tick = int24((tickCumulatives[1] - tickCumulatives[0]) / int56(int(ago)));

        uint160 sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);

        return (decodeSqrtPriceX96(assetCache, sqrtPriceX96), ago);
    }

    function resolvePricingConfig(AssetCache memory assetCache, AssetConfig memory config) private view returns (address underlying, uint16 pricingType, uint32 pricingParameters, uint24 twapWindow) {
        if (assetCache.pricingType == PRICINGTYPE__FORWARDED) {
            underlying = pTokenLookup[assetCache.underlying];

            AssetConfig memory newConfig = resolveAssetConfig(underlying);
            twapWindow = newConfig.twapWindow;

            AssetStorage storage newAssetStorage = eTokenLookup[newConfig.eTokenAddress];
            pricingType = newAssetStorage.pricingType;
            pricingParameters = newAssetStorage.pricingParameters;

            require(pricingType != PRICINGTYPE__FORWARDED, "e/nested-price-forwarding");
        } else {
            underlying = assetCache.underlying;
            pricingType = assetCache.pricingType;
            pricingParameters = assetCache.pricingParameters;
            twapWindow = config.twapWindow;
        }
    }

    function getPriceInternal(AssetCache memory assetCache, AssetConfig memory config) public FREEMEM returns (uint twap, uint twapPeriod) {
        (address underlying, uint16 pricingType, uint32 pricingParameters, uint24 twapWindow) = resolvePricingConfig(assetCache, config);

        if (pricingType == PRICINGTYPE__PEGGED) {
            twap = 1e18;
            twapPeriod = twapWindow;
        } else if (pricingType == PRICINGTYPE__UNISWAP3_TWAP) {
            address pool = computeUniswapPoolAddress(underlying, uint24(pricingParameters));
            (twap, twapPeriod) = callUniswapObserve(assetCache, pool, twapWindow);
        } else {
            revert("e/unknown-pricing-type");
        }
    }

    function getPrice(address underlying) external override returns (uint twap, uint twapPeriod) {
        AssetConfig memory config = resolveAssetConfig(underlying);
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        (twap, twapPeriod) = getPriceInternal(assetCache, config);
    }

    // This function is only meant to be called from a view so it doesn't need to be optimised.
    // The Euler protocol itself doesn't ever use currPrice as returned by this function.

    function getPriceFull(address underlying) external override returns (uint twap, uint twapPeriod, uint currPrice) {
        AssetConfig memory config = resolveAssetConfig(underlying);
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        (twap, twapPeriod) = getPriceInternal(assetCache, config);

        (address newUnderlying, uint16 pricingType, uint32 pricingParameters,) = resolvePricingConfig(assetCache, config);

        if (pricingType == PRICINGTYPE__PEGGED) {
            currPrice = 1e18;
        } else if (pricingType == PRICINGTYPE__UNISWAP3_TWAP || pricingType == PRICINGTYPE__FORWARDED) {
            AssetCache memory newAssetCache = loadAssetCache(newUnderlying, assetStorage);
            address pool = computeUniswapPoolAddress(newUnderlying, uint24(pricingParameters));
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
            currPrice = decodeSqrtPriceX96(newAssetCache, sqrtPriceX96);
        } else {
            revert("e/unknown-pricing-type");
        }
    }


    // Liquidity

    function computeLiquidityRaw(address account, address[] memory underlyings) private returns (LiquidityStatus memory status) {
        status.collateralValue = 0;
        status.liabilityValue = 0;
        status.numBorrows = 0;
        status.borrowIsolated = false;

        AssetConfig memory config;
        AssetStorage storage assetStorage;
        AssetCache memory assetCache;

        for (uint i = 0; i < underlyings.length; ++i) {
            address underlying = underlyings[i];
            bool assetCacheAndPriceInited = false;
            uint price;

            config = resolveAssetConfig(underlying);
            assetStorage = eTokenLookup[config.eTokenAddress];

            uint balance = assetStorage.users[account].balance;
            uint owed = assetStorage.users[account].owed;

            if (balance != 0 && config.collateralFactor != 0) {
                initAssetCache(underlying, assetStorage, assetCache);
                (price,) = getPriceInternal(assetCache, config);
                assetCacheAndPriceInited = true;

                uint assetCollateral = balanceToUnderlyingAmount(assetCache, balance);
                assetCollateral = assetCollateral * price / 1e18;
                assetCollateral = assetCollateral * config.collateralFactor / CONFIG_FACTOR_SCALE;
                status.collateralValue += assetCollateral;
            }

            if (owed != 0) {
                if (!assetCacheAndPriceInited) {
                    initAssetCache(underlying, assetStorage, assetCache);
                    (price,) = getPriceInternal(assetCache, config);
                    assetCacheAndPriceInited = true;
                }

                status.numBorrows++;
                if (config.borrowIsolated) status.borrowIsolated = true;

                uint assetLiability = getCurrentOwed(assetStorage, assetCache, account);
                assetLiability = assetLiability * price / 1e18;
                assetLiability = assetLiability * CONFIG_FACTOR_SCALE / config.borrowFactor;
                status.liabilityValue += assetLiability;
            }
        }
    }

    function computeLiquidity(address account) public override returns (LiquidityStatus memory) {
        return computeLiquidityRaw(account, getEnteredMarketsArray(account));
    }

    function computeAssetLiquidities(address account) external override returns (AssetLiquidity[] memory) {
        address[] memory underlyings = getEnteredMarketsArray(account);

        AssetLiquidity[] memory output = new AssetLiquidity[](underlyings.length);

        address[] memory singleUnderlying = new address[](1);

        for (uint i = 0; i < underlyings.length; ++i) {
            output[i].underlying = singleUnderlying[0] = underlyings[i];
            output[i].status = computeLiquidityRaw(account, singleUnderlying);
        }

        return output;
    }

    function requireLiquidity(address account) external override {
        LiquidityStatus memory status = computeLiquidity(account);

        require(!status.borrowIsolated || status.numBorrows == 1, "e/borrow-isolation-violation");
        require(status.collateralValue >= status.liabilityValue, "e/collateral-violation");
    }
}
