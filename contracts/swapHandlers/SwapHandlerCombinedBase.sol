// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./SwapHandlerBase.sol";
import "../vendor/ISwapRouterV3.sol";
import "../vendor/ISwapRouterV2.sol";

/// @notice Base contract for swap handlers which for exact output execute a secondary swap on Uniswap V2 or V3
abstract contract SwapHandlerCombinedBase is SwapHandlerBase {
    address immutable public uniSwapRouterV2;
    address immutable public uniSwapRouterV3;

    constructor(address uniSwapRouterV2_, address uniSwapRouterV3_) {
        uniSwapRouterV2 = uniSwapRouterV2_;
        uniSwapRouterV3 = uniSwapRouterV3_;
    }

    function executeSwap(SwapParams memory params) external override {
        if (params.mode == 0) {
            swapPrimary(params);
        } else {
            // For exact output expect a payload for the primary swap provider and a path to swap the remainder on Uni2 or Uni3
            bytes memory path;
            (params.payload, path) = abi.decode(params.payload, (bytes, bytes));

            uint primaryAmountOut = swapPrimary(params);

            if (primaryAmountOut < params.amountOut) {
                require(path.length > 0, "SwapHandlerPayloadBase: secondary path not provided");

                uint remainder;
                unchecked { remainder = params.amountOut - primaryAmountOut; }

                swapExactOutDirect(params, remainder, path);
            }
        }

        transferBack(params.underlyingIn);
    }

    function swapPrimary(SwapParams memory params) internal virtual returns (uint amountOut);

    function swapExactOutDirect(SwapParams memory params, uint amountOut, bytes memory path) private {
        (bool isUniV2, address[] memory uniV2Path) = detectAndDecodeUniV2Path(path);

        if (isUniV2) {
            setMaxAllowance(params.underlyingIn, params.amountIn, uniSwapRouterV2);

            ISwapRouterV2(uniSwapRouterV2).swapTokensForExactTokens(amountOut, type(uint).max, uniV2Path, msg.sender, block.timestamp);
        } else {
            setMaxAllowance(params.underlyingIn, params.amountIn, uniSwapRouterV3);

            ISwapRouterV3(uniSwapRouterV3).exactOutput(
                ISwapRouterV3.ExactOutputParams({
                    path: path,
                    recipient: msg.sender,
                    amountOut: amountOut,
                    amountInMaximum: type(uint).max,
                    deadline: block.timestamp
                })
            );
        }
    }

    function detectAndDecodeUniV2Path(bytes memory path) private pure returns (bool, address[] memory) {
        bool isUniV2 = path.length % 20 == 0;
        address[] memory addressPath;

        if (isUniV2) {
            uint addressPathSize = path.length / 20;
            addressPath = new address[](addressPathSize);

            for(uint i; i < addressPathSize; ++i) {
                addressPath[i] = toAddress(path, i * 20);
            }
        }

        return (isUniV2, addressPath);
    }

    function toAddress(bytes memory data, uint start) private pure returns (address result) {
        // assuming data length is already validated
        assembly {
            // borrowed from BytesLib https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol
            result := div(mload(add(add(data, 0x20), start)), 0x1000000000000000000000000)
        }
    }
}
