// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./SwapHandlerBase.sol";
import "../vendor/ISwapRouter.sol";

/// @notice Swap handler executing trades on UniswapV3 through SwapRouter
contract UniswapV3SwapHandler is SwapHandlerBase {
    address immutable public uniswapRouter;

    constructor(address uniswapRouter_) {
        uniswapRouter = uniswapRouter_;
    }

    function executeSwap(SwapParams calldata params) override external {
        setMaxAllowance(params.underlyingIn, uniswapRouter);

        if (params.payload.length == 64) {
            (uint sqrtPriceLimitX96, uint fee) = abi.decode(params.payload, (uint, uint));
            if (params.mode == 0)
                exactInputSingle(params, sqrtPriceLimitX96, fee);
            else
                exactOutputSingle(params, sqrtPriceLimitX96, fee);
        } else {
            if (params.mode == 0)
                exactInput(params, params.payload);
            else
                exactOutput(params, params.payload);
        }

        if (params.mode == 1) transferBack(params.underlyingIn);
    }

    function exactInputSingle(SwapParams memory params, uint sqrtPriceLimitX96, uint fee) private {
        ISwapRouter(uniswapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: uint24(fee),
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: params.amountIn,
                amountOutMinimum: params.amountOut,
                sqrtPriceLimitX96: uint160(sqrtPriceLimitX96)
            })
        );
    }

    function exactInput(SwapParams memory params, bytes memory path) private {
        ISwapRouter(uniswapRouter).exactInput(
            ISwapRouter.ExactInputParams({
                path: path,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountIn: params.amountIn,
                amountOutMinimum: params.amountOut
            })
        );
    }

    function exactOutputSingle(SwapParams memory params, uint sqrtPriceLimitX96, uint fee) private {
        ISwapRouter(uniswapRouter).exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: uint24(fee),
                recipient: msg.sender,
                deadline: block.timestamp,
                amountOut: params.amountOut,
                amountInMaximum: params.amountIn,
                sqrtPriceLimitX96: uint160(sqrtPriceLimitX96)
            })
        );
    }

    function exactOutput(SwapParams memory params, bytes memory path) private {
        ISwapRouter(uniswapRouter).exactOutput(
            ISwapRouter.ExactOutputParams({
                path: path,
                recipient: msg.sender,
                deadline: block.timestamp,
                amountOut: params.amountOut,
                amountInMaximum: params.amountIn
            })
        );
    }
}
