// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../vendor/TickMath.sol";
import "../vendor/FullMath.sol";
import "./IEulerPriceOracle.sol";

interface IStETH {
    function getPooledEthByShares(uint256 _sharesAmount) external view returns (uint256);
    function getSharesByPooledEth(uint256 _pooledEthAmount) external view returns (uint256);
}

interface IAggregatorV2V3 {
    function latestAnswer() external view returns (int256);
    function latestTimestamp() external view returns (uint256);
}

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
    function liquidity() external view returns (uint128);
    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives);
    function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 liquidityCumulative, bool initialized);
}

contract StETHEulerPriceOracle is IEulerPriceOracle {
    address immutable public WETH;
    address immutable public stETH;
    address immutable public wstETH;
    address immutable public chainlinkProxy;
    address immutable public uniswapFactory;
    bytes32 immutable public uniswapPoolInitCodeHash;
    uint32 constant twapWindow = 30 * 60;
    uint32 constant timeout = 24 * 60 * 60;
    uint32 constant STETH_UNDERLYING = 1;
    uint32 constant WSTETH_UNDERLYING = 2;

    constructor(
        address _WETH, 
        address _stETH, 
        address _wstETH, 
        address _chainlinkProxy, 
        address _uniswapFactory,
        bytes32 _uniswapPoolInitCodeHash
    ) {
        //WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
        //stETH = 0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84;
        //wstETH = 0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0;
        //chainlinkProxy = 0x86392dC19c0b719886221c78AB11eb8Cf5c52812;
        //uniswapFactory = 0x1F98431c8aD98523631AE4a59f267346ea31F984;
        //uniswapPoolInitCodeHash = 0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54;

        WETH = _WETH;
        stETH = _stETH;
        wstETH = _wstETH;
        chainlinkProxy = _chainlinkProxy;
        uniswapFactory = _uniswapFactory;
        uniswapPoolInitCodeHash = _uniswapPoolInitCodeHash;
    }

    function getPrice(uint32 params) external view override returns (uint256 price, uint256 ago) {
        (bool answerSuccess, bytes memory answerData) = chainlinkProxy.staticcall(abi.encodeWithSelector(IAggregatorV2V3.latestAnswer.selector));
        (bool timestampSuccess, bytes memory timestampData) = chainlinkProxy.staticcall(abi.encodeWithSelector(IAggregatorV2V3.latestTimestamp.selector));
        
        bool success = answerSuccess && timestampSuccess;
        int256 stETHPrice;
        uint256 wstETHPrice;
        uint256 timestamp;

        if (success) {
            stETHPrice = abi.decode(answerData, (int256));
            timestamp = abi.decode(timestampData, (uint256));
            ago = block.timestamp - timestamp;
        }

        if (!success || stETHPrice <= 0 || timeout < ago) {
            success = false;
            address pool = computeUniswapPoolAddress();
            (wstETHPrice, ago) = callUniswapObserve(pool);
        }

        if (params == STETH_UNDERLYING) {
            if (success) {
                price = uint256(stETHPrice);
            } else {
                uint256 tokensPerStEth = IStETH(stETH).getSharesByPooledEth(1 ether);
                price = tokensPerStEth * wstETHPrice / 1e18;
            }
        } else if (params == WSTETH_UNDERLYING) {
            if (success) {
                uint256 stEthPerToken = IStETH(stETH).getPooledEthByShares(1 ether);
                price = stEthPerToken * uint256(stETHPrice) / 1e18;
            } else {
                price = wstETHPrice;
            }
        } else {
            revert("e/steth-incorrect-parameter");
        }
    }

    function callUniswapObserve(address pool) private view returns (uint, uint) {
        uint32[] memory secondsAgos = new uint32[](2);
        uint256 ago = twapWindow;

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

        return (decodeSqrtPriceX96(sqrtPriceX96), ago);
    }

    function computeUniswapPoolAddress() private view returns (address pool) {
        pool = address(0);
        uint24 fee = 0;

        {
            uint24[4] memory fees = [uint24(3000), 10000, 500, 100];
            uint128 bestLiquidity = 0;

            for (uint i = 0; i < fees.length; ++i) {
                address candidatePool = IUniswapV3Factory(uniswapFactory).getPool(wstETH, WETH, fees[i]);
                if (candidatePool == address(0)) continue;

                uint128 liquidity = IUniswapV3Pool(candidatePool).liquidity();

                if (pool == address(0) || liquidity > bestLiquidity) {
                    pool = candidatePool;
                    fee = fees[i];
                    bestLiquidity = liquidity;
                }
            }
        }

        require(pool != address(0), "e/steth-no-uniswap-pool-avail");

        address confirmedPool = address(uint160(uint256(keccak256(abi.encodePacked(
            hex'ff',
            uniswapFactory,
            keccak256(abi.encode(wstETH, WETH, fee)),
            uniswapPoolInitCodeHash
        )))));

        require(confirmedPool == pool, "e/steth-bad-uniswap-pool-addr");
        return pool;
    }

    function decodeSqrtPriceX96(uint sqrtPriceX96) private pure returns (uint price) {
        price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / 1e18);

        if (price > 1e36) price = 1e36;
        else if (price == 0) price = 1;
    }

    function revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }

        revert("e/steth-empty-error");
    }
}
