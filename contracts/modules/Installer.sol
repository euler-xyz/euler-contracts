// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseModule.sol";


contract Installer is BaseModule {
    constructor() BaseModule(MODULEID__INSTALLER) {}

    modifier adminOnly {
        address msgSender = unpackTrailingParamMsgSender();
        require(msgSender == upgradeAdmin, "e/installer/unauthorized");
        _;
    }

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }

    function setUpgradeAdmin(address newUpgradeAdmin) external adminOnly {
        require(newUpgradeAdmin != address(0), "e/installer/bad-admin-addr");
        upgradeAdmin = newUpgradeAdmin;
    }

    function setGovernorAdmin(address newGovernorAdmin) external adminOnly {
        require(newGovernorAdmin != address(0), "e/installer/bad-gov-addr");
        governorAdmin = newGovernorAdmin;
    }

    function installModules(address[] memory moduleAddrs) external adminOnly {
        for (uint i = 0; i < moduleAddrs.length; i++) {
            address moduleAddr = moduleAddrs[i];
            uint moduleId = BaseModule(moduleAddr).moduleId();

            moduleLookup[moduleId] = moduleAddr;

            if (moduleId <= MAX_EXTERNAL_SINGLE_PROXY_MODULEID) {
                address proxyAddr = _createProxy(moduleId);
                trustedSenders[proxyAddr].moduleImpl = moduleAddr;
            }
        }
    }
}
