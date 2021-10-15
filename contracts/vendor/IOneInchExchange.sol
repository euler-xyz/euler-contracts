// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

interface IOneInchExchange {
    struct SwapDescription {
        address srcToken;
        address dstToken;
        address srcReceiver;
        address dstReceiver;
        uint256 amount;
        uint256 minReturnAmount;
        uint256 flags;
        bytes permit;
    }
}
