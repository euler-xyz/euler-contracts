// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/Installer.sol";
import "./BaseHarness.sol";

contract InstallerHarness is Installer, BaseHarness {
    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }

    function getGovernorAdmin() external view returns (address) {
        return governorAdmin;
    }

    function getModuleLookup(uint id) external view returns (address) {
        return moduleLookup[id];
    }

    function getProxyLookup(uint id) external view returns (address) {
        return proxyLookup[id];
    }
}