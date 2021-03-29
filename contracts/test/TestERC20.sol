pragma solidity ^0.8.0;
// SPDX-License-Identifier: UNLICENSED

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestERC20 is ERC20 {
    uint8 private myDecimals;

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        myDecimals = decimals_;
    }

    function decimals() public override view returns (uint8) {
        return myDecimals;
    }

    function mint(address who, uint amount) public {
        _mint(who, amount);
    }

    // For testing malicious tokens that change their decimals

    function changeDecimals(uint8 decimals_) public {
        myDecimals = decimals_;
    }
}
