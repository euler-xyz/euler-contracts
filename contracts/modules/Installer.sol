// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Installer is BaseLogic {
    constructor() BaseLogic(MODULEID__INSTALLER) {}

    modifier adminOnly {
        address msgSender = unpackTrailingParamMsgSender();
        require(msgSender == upgradeAdmin, "e/installer/unauthorized");
        _;
    }

    function installModules(address[] memory moduleAddrs) external adminOnly {
        for (uint i = 0; i < moduleAddrs.length; i++) {
            address moduleAddr = moduleAddrs[i];
            uint moduleId = IModule(moduleAddr).moduleId();

            moduleLookup[moduleId] = moduleAddr;

            if (moduleId <= MAX_EXTERNAL_SINGLE_PROXY_MODULEID) {
                address proxyAddr = _createProxy(moduleId);
                trustedSenders[proxyAddr].moduleImpl = moduleAddr;
            }
        }
    }

    function setGovernorAdmin(address newGovernorAdmin) external adminOnly {
        require(newGovernorAdmin != address(0), "e/installer/bad-gov-addr");
        governorAdmin = newGovernorAdmin;
    }
}
