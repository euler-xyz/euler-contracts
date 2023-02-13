// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockRETH {
  bool shouldRevert = false;
  uint256 exchangeRate;

  function mockSetRevert(bool _shouldRevert) external {
    shouldRevert = _shouldRevert;
  }

  function mockSetData(uint256 _exchangeRate) external {
    exchangeRate = _exchangeRate;
  }

  function getExchangeRate() external view returns (uint256) {
    if (shouldRevert) revert("");
    return exchangeRate;
  }
}
