// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/RiskManager.sol";

contract RiskManagerHarness is RiskManager {
    constructor(RiskManagerSettings memory settings) RiskManager(settings) {}

    function unpackTrailingParams() override internal view returns(address, address) {
        return (msg.sender, address(this));
    }
}