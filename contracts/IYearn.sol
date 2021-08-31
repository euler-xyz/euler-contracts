// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IYDAI {
  function deposit(uint _amount,address sender) external returns(uint256);
  function withdraw(uint _maxShares,address _recipient, uint maxLoss ) external returns(uint256);
  function balanceOf(address _address) external view returns(uint);
  function PricePerShare() external view returns(uint);
}