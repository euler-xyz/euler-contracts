// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./SwapHandlerPayloadBase.sol";

/// @notice Swap handler executing trades on 1Inch
contract SwapHandler1Inch is SwapHandlerPayloadBase {
    address immutable public oneInchAggregator;

    constructor(address oneInchAggregator_, address uniSwapRouter02) SwapHandlerPayloadBase(uniSwapRouter02) {
        oneInchAggregator = oneInchAggregator_;
    }

    function swapPrimary(SwapParams memory params, bytes memory payload) override internal returns (uint) {
        setMaxAllowance(params.underlyingIn, params.amountIn, oneInchAggregator);

        (bool success, bytes memory result) = oneInchAggregator.call(payload);
        if (!success) revertBytes(result);

        return abi.decode(result, (uint));
    }
}
