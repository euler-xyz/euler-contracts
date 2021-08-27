pragma solidity ^0.8.0;

import "./BasePOC.sol";

contract RiskManager is BasePOC {

    function rTestLink() external view returns (address) {
        return upgradeAdmin;
    }
}