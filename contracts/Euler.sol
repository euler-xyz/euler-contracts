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

    function dispatch() external {
        uint msgDataLength = msg.data.length;
        require(msgDataLength >= (4 + 4 + 32 + 32), "e/input-too-short");

        uint moduleId;

        assembly {
            calldatacopy(0, sub(msgDataLength, 32), 32)
            moduleId := mload(0)
        }

        address m = moduleLookup[moduleId];
        require(m != address(0), "e/module-not-installed");

        require(trustedSenders[msg.sender] != 0 || (moduleId == MODULEID__INSTALLER && msg.sender == upgradeAdmin), "e/sender-not-trusted");

        assembly {
            let payloadSize := sub(calldatasize(), 36)
            calldatacopy(0, 4, payloadSize)
            mstore(payloadSize, caller())

            let result := delegatecall(gas(), m, 0, add(payloadSize, 32), 0, 0)

            returndatacopy(0, 0, returndatasize())

            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
