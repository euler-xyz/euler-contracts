// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";
import "./Utils.sol";


contract PTokenVault {
    address immutable creator;

    constructor() {
        creator = msg.sender;
    }

    function transferTokens(address underlying, address to, uint amount) external {
        require(msg.sender == creator, "e/ptoken-vault/permission-denied");

        Utils.safeTransfer(underlying, to, amount);
    }
}
