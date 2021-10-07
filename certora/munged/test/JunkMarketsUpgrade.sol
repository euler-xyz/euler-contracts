// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


contract JunkMarketsUpgrade is BaseLogic {
    constructor() BaseLogic(MODULEID__MARKETS) {}

    function getEnteredMarkets(address) external pure returns (address[] memory output) {
        output;
        require(false, "JUNK_UPGRADE_TEST_FAILURE");
    }
}
