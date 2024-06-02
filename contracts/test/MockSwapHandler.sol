// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../swapHandlers/ISwapHandler.sol";
import "../Utils.sol";

/// @notice Base contract for swap handlers
contract MockSwapHandler is ISwapHandler {
    function executeSwap(SwapParams calldata params) override external {
        Utils.safeTransfer(params.underlyingOut, msg.sender, params.amountOut);
    }
}
