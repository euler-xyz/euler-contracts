// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Base.sol";


contract Euler is Base {
    constructor(address admin, address installerModule) {
        notEntered = 1;
        upgradeAdmin = admin;
        governorAdmin = admin;
        moduleLookup[MODULEID__INSTALLER] = installerModule;
    }

    string public constant name = "Euler Protocol";

    function moduleIdToImplementation(uint moduleId) external view returns (address) {
        return moduleLookup[moduleId];
    }

    function moduleIdToProxy(uint moduleId) external view returns (address) {
        return proxyLookup[moduleId];
    }

    function dispatch(uint moduleId, address msgSender, bytes calldata input) external returns (bytes memory) {
        address m = moduleLookup[moduleId];
        require(m != address(0), "e/module-not-installed");

        require(trustedSenders[msg.sender] != 0 || (moduleId == MODULEID__INSTALLER && msg.sender == upgradeAdmin), "e/sender-not-trusted");

        require(input.length >= 4, "e/input-too-short");

        // Append proxy address (msg.sender) and claimed originator (msgSender)

        bytes memory inputWrapped = abi.encodePacked(input, uint(uint160(msg.sender)), uint(uint160(msgSender)));

        (bool success, bytes memory result) = m.delegatecall(inputWrapped);
        if (!success) revertBytes(result);
        return result;
    }
}
