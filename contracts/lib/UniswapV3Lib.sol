// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../vendor/TickMath.sol";
import "../vendor/FullMath.sol";
import "../vendor/IUniswapV3Pool.sol";


library UniswapV3Lib {
    function findBestUniswapPool(address factory, bytes32 poolInitCodeHash, address underlying, address referenceAsset) internal view returns (address pool, uint24 fee) {
        pool = address(0);
        fee = 0;

        uint24[4] memory fees = [uint24(3000), 10000, 500, 100];
        uint128 bestLiquidity = 0;

        for (uint i = 0; i < fees.length;) {
            address candidatePool = computeUniswapPoolAddress(factory, poolInitCodeHash, underlying, referenceAsset, fees[i]);
            
            if (candidatePool.code.length > 0) {
                uint128 liquidity = IUniswapV3Pool(candidatePool).liquidity();

                if (pool == address(0) || liquidity > bestLiquidity) {
                    pool = candidatePool;
                    fee = fees[i];
                    bestLiquidity = liquidity;
                }
            }

            unchecked { ++i; }
        }
    }

    function computeUniswapPoolAddress(address factory, bytes32 poolInitCodeHash, address tokenA, address tokenB, uint24 fee) internal pure returns (address) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        return address(uint160(uint256(keccak256(abi.encodePacked(
            hex'ff',
            factory,
            keccak256(abi.encode(tokenA, tokenB, fee)),
            poolInitCodeHash
        )))));
    }

    function uniswapObserve(address pool, uint ago) internal view returns (uint, uint) {
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

        return (TickMath.getSqrtRatioAtTick(tick), ago);
    }

    function revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }

        revert("e/uniswap-v3-twap-empty-error");
    }
}
