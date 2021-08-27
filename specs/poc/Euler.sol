pragma solidity ^0.8.0;

import "./BasePOC.sol";
import "./EToken.sol";
import "./DToken.sol";


contract Euler is BasePOC {
    constructor() BaseModule(0) {}

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }

    function testInternal() external returns (address) {
        (bool s, bytes memory d) = et.delegatecall(abi.encodeWithSelector(EToken.testInternalModule.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }


    function mint(uint subAccountId, uint amount) external {
        (bool s, bytes memory d) = et.delegatecall(abi.encodeWithSelector(EToken.mint.selector, subAccountId, amount));
        require(s, string(d));
    }
}