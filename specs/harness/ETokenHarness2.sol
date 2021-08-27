// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/EToken.sol";
import "./BaseHarness.sol";

contract ETokenHarness is EToken, BaseHarness {
  function myAddress() external view returns (address) {
    return address(this);
  }

  function unpackTrailingParams() override internal pure returns(address, address) {
    return (msg.sender, address(this));
  }
}