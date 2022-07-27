// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./ISwapHandler.sol";
import "../Interfaces.sol";
import "../Utils.sol";

/// @notice Base contract for swap handlers
abstract contract SwapHandlerBase is ISwapHandler {
    function transferBack(address token) internal {
        uint balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) Utils.safeTransfer(token, msg.sender, balance);
    }

    function setMaxAllowance(address token, uint minAllowance, address spender) internal {
        uint allowance = IERC20(token).allowance(address(this), spender);
        if (allowance < minAllowance) Utils.safeApprove(token, spender, type(uint).max);
    }

    function revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }

        revert("e/empty-error");
    }
}
