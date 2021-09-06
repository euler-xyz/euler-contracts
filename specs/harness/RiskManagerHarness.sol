pragma solidity ^0.8.0;

import "./BaseHarness.sol";
import "../../contracts/modules/RiskManager.sol";

contract RiskManagerHarness is RiskManager, BaseHarness {

    constructor(RiskManagerSettings memory settings) RiskManager(settings) {}

    // function computeNewInterestRate(uint, address, uint32) internal override returns (int96) {
    //     return 3170979198376458650;
    // }

    function callInternalModule(uint moduleId, bytes memory input) override(Base, BaseHarness) internal returns (bytes memory) {
        return BaseHarness.callInternalModule(moduleId, input);
    }
}