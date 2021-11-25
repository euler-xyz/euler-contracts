// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


contract JunkMarketsUpgrade is BaseLogic {
    constructor() BaseLogic(MODULEID__MARKETS, bytes32(uint(0x1234))) {}

    function getEnteredMarkets(address) external pure returns (address[] memory output) {
        output;
        require(false, "JUNK_UPGRADE_TEST_FAILURE");
    }
}
