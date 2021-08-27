// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../../contracts/modules/EToken.sol";
import "../../contracts/modules/RiskManager.sol";
import "./BaseHarness.sol";

contract ETokenHarness is EToken, BaseHarness {
    RiskManager rm;

    function callInternalModule(uint moduleId, bytes memory input) override internal returns (bytes memory) {
        bool success = false;
        bytes memory result;
        if(moduleId == MODULEID__RISK_MANAGER) {
            (success, result) = address(rm).delegatecall(input);
        }
            
        require(success, "call internal module");
        return result;
    }

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }
}