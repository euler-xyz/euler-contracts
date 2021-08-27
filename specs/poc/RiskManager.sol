pragma solidity ^0.8.0;

import "./BasePOC.sol";

contract RiskManager is BasePOC {

    constructor() BaseModule(MODULEID__RISK_MANAGER) {}

    function rTestLink() external view returns (address) {
        return upgradeAdmin;
    }
}