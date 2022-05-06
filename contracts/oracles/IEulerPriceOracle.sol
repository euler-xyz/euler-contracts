// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

interface IEulerPriceOracle {
    function description() external pure returns (string memory desc);
    function getPrice(uint96 params) external view returns (uint256 price, uint256 ago);
}
