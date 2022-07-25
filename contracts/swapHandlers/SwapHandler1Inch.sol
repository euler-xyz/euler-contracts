// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./SwapHandlerBase.sol";
import "../vendor/ISwapRouter.sol";

/// @notice Swap handler executing trades on 1Inch
contract SwapHandler1Inch is SwapHandlerBase {
    address immutable public oneInchRouter;

    constructor(address oneInchRouter_) {
        oneInchRouter = oneInchRouter_;
    }

    function executeSwap(SwapParams calldata params) override external {
        setMaxAllowance(params.underlyingIn, params.amountIn, oneInchRouter);

        (bool success, bytes memory result) = oneInchRouter.call(params.payload);
        if (!success) revertBytes(result);

        transferBack(params.underlyingIn);
        transferBack(params.underlyingOut);
    }
}
