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
    function liquidity() external view returns (uint128);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives);
    function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 liquidityCumulative, bool initialized);
    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external;
}

interface IChainlinkAggregatorV2V3 {
    function latestAnswer() external view returns (int256);
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

    constructor(bytes32 moduleGitCommit_, RiskManagerSettings memory settings) BaseLogic(MODULEID__RISK_MANAGER, moduleGitCommit_) {
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

            // The uniswap pool (fee-level) with the highest in-range liquidity is used by default.
            // This is a heuristic and can easily be manipulated by the activator, so users should
            // verify the selection is suitable before using the pool. Otherwise, governance will
            // need to change the pricing config for the market.

            address pool = address(0);
            uint24 fee = 0;

            {
                uint24[4] memory fees = [uint24(3000), 10000, 500, 100];
                uint128 bestLiquidity = 0;

                for (uint i = 0; i < fees.length; ++i) {
                    address candidatePool = IUniswapV3Factory(uniswapFactory).getPool(underlying, referenceAsset, fees[i]);
                    if (candidatePool == address(0)) continue;

                    uint128 liquidity = IUniswapV3Pool(candidatePool).liquidity();

                    if (pool == address(0) || liquidity > bestLiquidity) {
                        pool = candidatePool;
                        fee = fees[i];
                        bestLiquidity = liquidity;
                    }
                }
            }

            require(pool != address(0), "e/no-uniswap-pool-avail");
            require(computeUniswapPoolAddress(underlying, fee) == pool, "e/bad-uniswap-pool-addr");

            p.pricingType = PRICINGTYPE__UNISWAP3_TWAP;
            p.pricingParameters = uint32(fee);

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


    function decodeSqrtPriceX96(address underlying, uint underlyingDecimalsScaler, uint sqrtPriceX96) private view returns (uint price) {
        if (uint160(underlying) < uint160(referenceAsset)) {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / 1e18) / underlyingDecimalsScaler;
        } else {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / (1e18 * underlyingDecimalsScaler));
            if (price == 0) return 1e36;
            price = 1e36 / price;
        }

        if (price > 1e36) price = 1e36;
        else if (price == 0) price = 1;
    }

    function callUniswapObserve(address underlying, uint underlyingDecimalsScaler, address pool, uint ago) private view returns (uint, uint) {
        uint32[] memory secondsAgos = new uint32[](2);

        secondsAgos[0] = uint32(ago);
        secondsAgos[1] = 0;

        (bool success, bytes memory data) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.observe.selector, secondsAgos));

        if (!success) {
            if (keccak256(data) != keccak256(abi.encodeWithSignature("Error(string)", "OLD"))) revertBytes(data);

            // The oldest available observation in the ring buffer is the index following the current (accounting for wrapping),
            // since this is the one that will be overwritten next.

            (,, uint16 index, uint16 cardinality,,,) = IUniswapV3Pool(pool).slot0();

            (uint32 oldestAvailableAge,,,bool initialized) = IUniswapV3Pool(pool).observations((index + 1) % cardinality);

            // If the following observation in a ring buffer of our current cardinality is uninitialized, then all the
            // observations at higher indices are also uninitialized, so we wrap back to index 0, which we now know
            // to be the oldest available observation.

            if (!initialized) (oldestAvailableAge,,,) = IUniswapV3Pool(pool).observations(0);

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

        return (decodeSqrtPriceX96(underlying, underlyingDecimalsScaler, sqrtPriceX96), ago);
    }

    function callChainlinkLatestAnswer(address chainlinkAggregator) private view returns (uint price) {
        // IMPORTANT as per H-03 item from August 2022 WatchPug audit:
        // if Chainlink starts using shorter heartbeats and/or before deploying to the sidechain/L2,
        // the latestAnswer call should be replaced by latestRoundData and updatedTime should be checked 
        // to detect staleness of the oracle
        (bool success, bytes memory data) = chainlinkAggregator.staticcall(abi.encodeWithSelector(IChainlinkAggregatorV2V3.latestAnswer.selector));

        if (!success) {
            return 0;
        }

        int256 answer = abi.decode(data, (int256));
        if (answer <= 0) {
            return 0;
        }

        price = uint(answer);
        if (price > 1e36) price = 1e36;
    }

    function resolvePricingConfig(AssetCache memory assetCache, AssetConfig memory config) private view returns (address underlying, uint16 pricingType, uint32 pricingParameters, uint24 twapWindow, uint underlyingDecimalsScaler) {
        if (assetCache.pricingType == PRICINGTYPE__FORWARDED) {
            underlying = pTokenLookup[assetCache.underlying];

            AssetConfig memory newConfig = resolveAssetConfig(underlying);
            twapWindow = newConfig.twapWindow;

            AssetStorage storage newAssetStorage = eTokenLookup[newConfig.eTokenAddress];
            pricingType = newAssetStorage.pricingType;
            pricingParameters = newAssetStorage.pricingParameters;
            underlyingDecimalsScaler = 10**(18 - newAssetStorage.underlyingDecimals);

            require(pricingType != PRICINGTYPE__FORWARDED, "e/nested-price-forwarding");
        } else {
            underlying = assetCache.underlying;
            pricingType = assetCache.pricingType;
            pricingParameters = assetCache.pricingParameters;
            twapWindow = config.twapWindow;
            underlyingDecimalsScaler = assetCache.underlyingDecimalsScaler;
        }
    }

    function getPriceInternal(AssetCache memory assetCache, AssetConfig memory config) public view FREEMEM returns (uint twap, uint twapPeriod) {
        (address underlying, uint16 pricingType, uint32 pricingParameters, uint24 twapWindow, uint underlyingDecimalsScaler) = resolvePricingConfig(assetCache, config);

        if (pricingType == PRICINGTYPE__PEGGED) {
            twap = 1e18;
            twapPeriod = twapWindow;
        } else if (pricingType == PRICINGTYPE__UNISWAP3_TWAP) {
            address pool = computeUniswapPoolAddress(underlying, uint24(pricingParameters));
            (twap, twapPeriod) = callUniswapObserve(underlying, underlyingDecimalsScaler, pool, twapWindow);
        } else if (pricingType == PRICINGTYPE__CHAINLINK) {
            twap = callChainlinkLatestAnswer(chainlinkPriceFeedLookup[underlying]);
            twapPeriod = 0;

            // if price invalid and uniswap fallback pool configured get the price from uniswap
            if (twap == 0 && uint24(pricingParameters) != 0) {
                address pool = computeUniswapPoolAddress(underlying, uint24(pricingParameters));
                (twap, twapPeriod) = callUniswapObserve(underlying, underlyingDecimalsScaler, pool, twapWindow);
            }

            require(twap != 0, "e/unable-to-get-the-price");
        } else {
            revert("e/unknown-pricing-type");
        }
    }

    function getPrice(address underlying) external view override returns (uint twap, uint twapPeriod) {
        AssetConfig memory config = resolveAssetConfig(underlying);
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
        AssetCache memory assetCache = internalLoadAssetCacheRO(underlying, assetStorage);

        (twap, twapPeriod) = getPriceInternal(assetCache, config);
    }

    // This function is only meant to be called from a view so it doesn't need to be optimised.
    // The Euler protocol itself doesn't ever use currPrice as returned by this function.

    function getPriceFull(address underlying) external view override returns (uint twap, uint twapPeriod, uint currPrice) {
        AssetConfig memory config = resolveAssetConfig(underlying);
        AssetStorage storage assetStorage = eTokenLookup[config.eTokenAddress];
        AssetCache memory assetCache = internalLoadAssetCacheRO(underlying, assetStorage);

        (twap, twapPeriod) = getPriceInternal(assetCache, config);

        (address newUnderlying, uint16 pricingType, uint32 pricingParameters, , uint underlyingDecimalsScaler) = resolvePricingConfig(assetCache, config);

        if (pricingType == PRICINGTYPE__PEGGED) {
            currPrice = 1e18;
        } else if (pricingType == PRICINGTYPE__UNISWAP3_TWAP || pricingType == PRICINGTYPE__FORWARDED) {
            address pool = computeUniswapPoolAddress(newUnderlying, uint24(pricingParameters));
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(pool).slot0();
            currPrice = decodeSqrtPriceX96(newUnderlying, underlyingDecimalsScaler, sqrtPriceX96);
        } else if (pricingType == PRICINGTYPE__CHAINLINK) {
            currPrice = twap;
        } else {
            revert("e/unknown-pricing-type");
        }
    }


    // Liquidity

    function computeLiquidityRaw(address account, address[] memory underlyings) private view returns (LiquidityStatus memory status) {
        status.collateralValue = 0;
        status.liabilityValue = 0;
        status.numBorrows = 0;
        status.borrowIsolated = false;

        AssetConfig memory config;
        AssetStorage storage assetStorage;
        AssetCache memory assetCache;

        for (uint i = 0; i < underlyings.length; ++i) {
            address underlying = underlyings[i];

            config = resolveAssetConfig(underlying);
            assetStorage = eTokenLookup[config.eTokenAddress];

            uint balance = assetStorage.users[account].balance;
            uint owed = assetStorage.users[account].owed;

            if (owed != 0) {
                initAssetCache(underlying, assetStorage, assetCache);
                (uint price,) = getPriceInternal(assetCache, config);

                status.numBorrows++;
                if (config.borrowIsolated) status.borrowIsolated = true;

                uint assetLiability = getCurrentOwed(assetStorage, assetCache, account);

                if (balance != 0) { // self-collateralisation
                    uint balanceInUnderlying = balanceToUnderlyingAmount(assetCache, balance);

                    uint selfAmount = assetLiability;
                    uint selfAmountAdjusted = assetLiability * CONFIG_FACTOR_SCALE / SELF_COLLATERAL_FACTOR;

                    if (selfAmountAdjusted > balanceInUnderlying) {
                        selfAmount = balanceInUnderlying * SELF_COLLATERAL_FACTOR / CONFIG_FACTOR_SCALE;
                        selfAmountAdjusted = balanceInUnderlying;
                    }

                    {
                        uint assetCollateral = (balanceInUnderlying - selfAmountAdjusted) * config.collateralFactor / CONFIG_FACTOR_SCALE;
                        assetCollateral += selfAmount;
                        status.collateralValue += assetCollateral * price / 1e18;
                    }

                    assetLiability -= selfAmount;
                    status.liabilityValue += selfAmount * price / 1e18;
                    status.borrowIsolated = true; // self-collateralised loans are always isolated
                }

                assetLiability = assetLiability * price / 1e18;
                assetLiability = config.borrowFactor != 0 ? assetLiability * CONFIG_FACTOR_SCALE / config.borrowFactor : MAX_SANE_DEBT_AMOUNT;
                status.liabilityValue += assetLiability;
            } else if (balance != 0 && config.collateralFactor != 0) {
                initAssetCache(underlying, assetStorage, assetCache);
                (uint price,) = getPriceInternal(assetCache, config);

                uint balanceInUnderlying = balanceToUnderlyingAmount(assetCache, balance);
                uint assetCollateral = balanceInUnderlying * price / 1e18;
                assetCollateral = assetCollateral * config.collateralFactor / CONFIG_FACTOR_SCALE;
                status.collateralValue += assetCollateral;
            }
        }
    }

    function computeLiquidity(address account) public view override returns (LiquidityStatus memory) {
        return computeLiquidityRaw(account, getEnteredMarketsArray(account));
    }

    function computeAssetLiquidities(address account) external view override returns (AssetLiquidity[] memory) {
        address[] memory underlyings = getEnteredMarketsArray(account);

        AssetLiquidity[] memory output = new AssetLiquidity[](underlyings.length);

        address[] memory singleUnderlying = new address[](1);

        for (uint i = 0; i < underlyings.length; ++i) {
            output[i].underlying = singleUnderlying[0] = underlyings[i];
            output[i].status = computeLiquidityRaw(account, singleUnderlying);
        }

        return output;
    }

    function requireLiquidity(address account) external view override {
        LiquidityStatus memory status = computeLiquidity(account);

        require(!status.borrowIsolated || status.numBorrows == 1, "e/borrow-isolation-violation");
        require(status.collateralValue >= status.liabilityValue, "e/collateral-violation");
    }
}
