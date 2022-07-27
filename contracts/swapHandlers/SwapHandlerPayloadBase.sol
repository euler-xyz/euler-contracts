// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./SwapHandlerBase.sol";
import "../vendor/ISwapRouter02.sol";

/// @notice Base contract for swap handlers which execute a black-box primary swap and additionally, for exact out, a secondary swap on Uniswap.
abstract contract SwapHandlerPayloadBase is SwapHandlerBase {
    address immutable public uniSwapRouter02;

    constructor(address uniSwapRouter02_) {
        uniSwapRouter02 = uniSwapRouter02_;
    }

    function executeSwap(SwapParams calldata params) external override {
        if (params.mode == 0) {
            swapPrimary(params, params.payload);
        } else {
            // For exact output expect a payload for the primary swap provider and a path to swap the remainder on Uni2 or Uni3
            (bytes memory primaryPayload, bytes memory path) = abi.decode(params.payload, (bytes, bytes));

            uint primaryAmountOut = swapPrimary(params, primaryPayload);
            require(primaryAmountOut <= params.amountOut, 'SwapHandlerPayloadBase: primary amount out');

            if (primaryAmountOut != params.amountOut) {
                uint remainder;
                unchecked { remainder = params.amountOut - primaryAmountOut; }

                setMaxAllowance(params.underlyingIn, remainder, uniSwapRouter02);

                swapExactOut(remainder, path);
            }
        }

        transferBack(params.underlyingIn);
    }

    function swapPrimary(SwapParams memory params, bytes memory payload) internal virtual returns (uint amountOut);

    function swapExactOut(uint amountOut, bytes memory path) private {
        (bool isUniV2, address[] memory uniV2Path) = detectAndDecodeUniV2Path(path);

        if (isUniV2) {
            ISwapRouter02(uniSwapRouter02).swapTokensForExactTokens(amountOut, type(uint).max, uniV2Path, msg.sender);
        } else {
            ISwapRouter02(uniSwapRouter02).exactOutput(
                IV3SwapRouter.ExactOutputParams({
                    path: path,
                    recipient: msg.sender,
                    amountOut: amountOut,
                    amountInMaximum: type(uint).max
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
