// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../vendor/TickMath.sol";

interface IUniswapV3PoolDeployer {
    function parameters() external view returns (
            address factory,
            address token0,
            address token1,
            uint24 fee,
            int24 tickSpacing
        );
}

contract MockUniswapV3Pool {
    address public immutable factory;
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;

    constructor() {
        (factory, token0, token1, fee,) = IUniswapV3PoolDeployer(msg.sender).parameters();
    }





    uint160 currSqrtPriceX96;
    int24 currTwap;
    bool throwOld;

    function mockSetTwap(uint160 sqrtPriceX96) external {
        currSqrtPriceX96 = sqrtPriceX96;
        currTwap = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
    }

    function mockSetThrowOld(bool val) external {
        throwOld = val;
    }




    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked) {
        sqrtPriceX96 = currSqrtPriceX96;

        // FIXME: finish this
        observationIndex; observationCardinality; observationCardinalityNext;

        // Not used in Euler tests:
        tick = 0;
        feeProtocol = 0;
        unlocked = false;
    }

    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives) {
        require(!throwOld, "OLD");

        require(secondsAgos.length == 2, "uniswap-pool-mock/unsupported-args-1");
        require(secondsAgos[1] == 0, "uniswap-pool-mock/unsupported-args-2");
        require(secondsAgos[0] > 0, "uniswap-pool-mock/unsupported-args-3");

        tickCumulatives = new int56[](2);
        liquidityCumulatives = new uint160[](2);

        tickCumulatives[0] = int56(currTwap) * int56(uint56(secondsAgos[0]));
        tickCumulatives[1] = 0;
        liquidityCumulatives[0] = liquidityCumulatives[1] = 0;
    }




    function observations(uint256 index) external view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 liquidityCumulative, bool initialized) {
        // FIXME finish this
    }

    function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external {
        // FIXME finish this
    }
}
