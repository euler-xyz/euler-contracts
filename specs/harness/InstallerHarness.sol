// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/Installer.sol";

contract InstallerHarness is Installer {

    function requireCode(address _addr) external view {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }

        require(size > 0, "no code");
    }

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