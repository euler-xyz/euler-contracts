pragma solidity ^0.8.0;

import "./BasePOC.sol";
import "./RiskManager.sol";

contract EToken is BasePOC {

    function testInternalModule() external returns (address) {
        bytes memory res = callInternalModule(MODULEID__RISK_MANAGER, abi.encodeWithSelector(RiskManager.rTestLink.selector));
        return abi.decode(res, (address));
    }
}