// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Base.sol";


/// @notice Main storage contract for the Euler system
contract Euler is Base {
    constructor(address admin, address installerModule) {
        emit Genesis();

        reentrancyLock = REENTRANCYLOCK__UNLOCKED;
        upgradeAdmin = admin;
        governorAdmin = admin;

        moduleLookup[MODULEID__INSTALLER] = installerModule;
        _createProxy(MODULEID__INSTALLER);
    }

    string public constant name = "Euler Protocol";

    function moduleIdToImplementation(uint moduleId) external view returns (address) {
        return moduleLookup[moduleId];
    }

    /// @notice Lookup a proxy that can be used to interact with a module
    /// @param moduleId Fixed constant that refers to a module type (ie MODULEID__MARKETS)
    /// @return An address that you can call, ie IEulerMarkets(a).enterMarket(...)
    function moduleIdToProxy(uint moduleId) external view returns (address) {
        return proxyLookup[moduleId];
    }

    function dispatch() external {
        uint32 moduleId = trustedSenders[msg.sender].moduleId;
        address moduleImpl = trustedSenders[msg.sender].moduleImpl;

        require(moduleId != 0, "e/sender-not-trusted");

        if (moduleImpl == address(0)) moduleImpl = moduleLookup[moduleId];

        uint msgDataLength = msg.data.length;
        require(msgDataLength >= (4 + 4 + 20), "e/input-too-short");

        assembly {
            let payloadSize := sub(calldatasize(), 4)
            calldatacopy(0, 4, payloadSize)
            mstore(payloadSize, shl(96, caller()))

            let result := delegatecall(gas(), moduleImpl, 0, add(payloadSize, 20), 0, 0)

            returndatacopy(0, 0, returndatasize())

            switch result
                case 0 { revert(0, returndatasize()) }
                default { return(0, returndatasize()) }
        }
    }
}
