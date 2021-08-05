// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/Installer.sol";

contract InstallerHarness is Installer {

    function requireCodesize(address _addr) external view returns (bool) {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }

        require(size > 0, "no code");
        return true;
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
    // uint cnt;
    // function consumeGas(address[] memory _arr) external {
    //     for (uint i = 0; i < _arr.length; i++) {
    //         cnt++;
    //     }
    // }
}