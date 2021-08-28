pragma solidity ^0.8.0;

import "./BaseLogic.sol";

abstract contract BasePOC is BaseLogic {
    address public et;
    address public dt;
    address public rm;

    address public ut; // underlying token

    function callInternalModule(uint moduleId, bytes memory input) override internal returns (bytes memory) {
        bool success = false;
        bytes memory result;
        if(moduleId == MODULEID__RISK_MANAGER) {
            (success, result) = rm.delegatecall(input);
        }
            
        return result;
    }

    function unpackTrailingParams() override internal view returns(address, address) {
        return (msg.sender, address(this));
    }

    // function computeNewInterestRate(uint, address, uint32) internal override returns (int96) {
    //     return 3170979198376458650;
    // }

    function emitViaProxy_Transfer(address, address, address, uint) internal override {}

    function emitViaProxy_Approval(address, address, address, uint) internal override {}

    function callBalanceOf(AssetCache memory, address account) internal view override returns (uint) {
        return IERC20(ut).balanceOf(account);
    }
}