// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;
// import "hardhat/console.sol"; // FIXME: dev only

import "./Storage.sol";
import "./Events.sol";
import "./Proxy.sol";

abstract contract Base is Storage, Events {
    // Modules

    function _createProxy(uint proxyModuleId) internal returns (address) {
        require(proxyModuleId != 0, "e/create-proxy/invalid-module");
        require(proxyModuleId <= MAX_EXTERNAL_MODULEID, "e/create-proxy/internal-module");

        // If we've already created a proxy for a single-proxy module, just return it:

        if (proxyLookup[proxyModuleId] != address(0)) return proxyLookup[proxyModuleId];

        // Otherwise create a proxy:

        address proxyAddr = address(new Proxy());

        if (proxyModuleId <= MAX_EXTERNAL_SINGLE_PROXY_MODULEID) proxyLookup[proxyModuleId] = proxyAddr;

        trustedSenders[proxyAddr] = TrustedSenderInfo({ moduleId: uint32(proxyModuleId), moduleImpl: address(0) });

        emit ProxyCreated(proxyAddr, proxyModuleId);

        return proxyAddr;
    }

    function callInternalModule(uint moduleId, bytes memory input) virtual internal returns (bytes memory) {
        (bool success, bytes memory result) = moduleLookup[moduleId].delegatecall(input);
        if (!success) revertBytes(result);
        return result;
    }



    // Modifiers

    modifier nonReentrant() {
        require(reentrancyLock == REENTRANCYLOCK__UNLOCKED, "e/reentrancy");

        reentrancyLock = REENTRANCYLOCK__LOCKED;
        _;
        reentrancyLock = REENTRANCYLOCK__UNLOCKED;
    }

    modifier reentrantOK() { // documentation only
        _;
    }



    // Error handling

    function revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }

        revert("e/empty-error");
    }



    // FIXME: dev only utilities

    modifier dumpGas(string memory tag) {
        uint a = gasleft();
        _;
        uint b = gasleft();
        // console.log("GAS", tag, a - b);
    }
}
