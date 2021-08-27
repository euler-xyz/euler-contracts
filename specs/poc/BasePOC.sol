pragma solidity ^0.8.0;

import "./BaseLogic.sol";

abstract contract BasePOC is BaseLogic {
    address public et;
    address public dt;
    address public rm;

    function getModuleLookup(uint moduleId) public view returns(address) {
        return moduleLookup[moduleId];
    }

    function callInternalModule(uint moduleId, bytes memory input) override internal returns (bytes memory) {
        bool success = false;
        bytes memory result;
        if(moduleId == MODULEID__RISK_MANAGER) {
            (success, result) = rm.delegatecall(input);
        }
            
        require(success, "call internal module");
        return result;
    }
}