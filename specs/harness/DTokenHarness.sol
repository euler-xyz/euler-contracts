// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/DToken.sol";

contract DTokenHarness is DToken {
    function unpackTrailingParams() override internal view returns(address, address) {
        return (msg.sender, address(this));
    }
}