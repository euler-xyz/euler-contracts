pragma solidity ^0.8.0;

import "../../contracts/BaseLogic.sol";

abstract contract BaseHarness is BaseLogic {
    address public et; // EToken
    address public dt; // DToken
    address public rm; // RiskManager

    address public ut; // underlying DummyERC20

    function requireCode(address addr) external view {
        uint256 size;
        assembly {
            size := extcodesize(addr)
        }

        require(size > 0, "no code");
    }

    function callInternalModule(uint moduleId, bytes memory input) override virtual internal returns (bytes memory) {
        bool success = false;
        bytes memory result;
        if(moduleId == MODULEID__RISK_MANAGER) {
            (success, result) = rm.delegatecall(input);
        }
            
        return result;
    }
}