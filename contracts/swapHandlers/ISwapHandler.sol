// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

interface ISwapHandler {
    struct SwapParams {
        address underlyingIn;
        address underlyingOut;
        uint mode;                  // 0=exactIn  1=exactOut
        uint amountIn;              // mode 0: exact,    mode 1: maximum
        uint amountOut;             // mode 0: minimum,  mode 1: exact
        uint exactOutTolerance;     // mode 0: ignored,  mode 1: downward tolerance on amountOut (fee-on-transfer etc.)
        bytes payload;
    }

    function executeSwap(SwapParams calldata params) external;
}
