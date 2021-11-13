// SPDX-License-Identifier: UNLICENSED
// pragma experimental ABIEncoderV2;
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint value) external returns (bool);
    function approve(address spender, uint value) external returns (bool);
}

interface IUniswapV3PoolFactory {
    /// @notice Returns the pool address for a given pair of tokens and a fee, or address 0 if it does not exist
    /// @dev tokenA and tokenB may be passed in either token0/token1 or token1/token0 order
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @param fee The fee collected upon every swap in the pool, denominated in hundredths of a bip
    /// @return pool The pool address
    function getPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external view returns (address pool);
}

interface IUniswapV3Pool {
    function token0() external view returns (address);

    function token1() external view returns (address);

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Swaps `amountIn` of one token for as much as possible of another token
    /// @param params The parameters necessary for the swap, encoded as `ExactInputSingleParams` in calldata
    /// @return amountOut The amount of the received token
    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

contract UniswapV3SwapRouterPeriphery {
    address owner;
    address immutable referenceAsset;

    constructor(address _referenceAsset) {
        referenceAsset = _referenceAsset;
        owner = msg.sender;
    }

    function exactInputSingle(
        address factory,
        address swapRouter,
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 deadline,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external payable returns (uint256 amountOut, uint256 sqrtPrice) {
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams(
                tokenIn,
                tokenOut,
                fee,
                recipient,
                deadline,
                amountIn,
                amountOutMinimum,
                sqrtPriceLimitX96
            );
        // approve amount for swapRouter to perform a transferFrom call
        IERC20(tokenIn).approve(swapRouter, amountIn);
        // execute swap via swapRouter and get amount of tokenOut received from uniswap v3 pool
        amountOut = ISwapRouter(swapRouter).exactInputSingle{value:msg.value}(params);
        // get current/latest price directly from the pool
        sqrtPrice = getPoolCurrentPrice(factory, tokenIn, tokenOut, fee);
    }

    function getPoolCurrentPrice(address factory, address tokenIn, address tokenOut, uint24 fee) public view returns (uint sqrtPrice) {
        address pool = IUniswapV3PoolFactory(factory).getPool(
            tokenIn,
            tokenOut,
            fee
        );
        (uint sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
        if (sqrtPriceX96 <= 2505418623681149822473) return 1e3;
        if (sqrtPriceX96 >= 2505410343826649584586222772852783278) return 1e33;
        // returns WETH per token here
        sqrtPrice = sqrtPriceX96 * sqrtPriceX96 / (uint(2**(96*2)) / 1e18);
        // returns token per WETH here
        if (uint160(tokenIn) < uint160(referenceAsset) || uint160(tokenOut) < uint160(referenceAsset)) sqrtPrice = (1e18 * 1e18) / sqrtPrice;
    }

    function withdraw(address token, uint256 amount) external {
        IERC20(token).transfer(owner, amount);
    }
}
