pragma solidity ^0.8.0;

import "./Storage.sol";

contract RiskManager is Storage {

    function rTestLink() external view returns (address) {
        return upgradeAdmin;
    }
}