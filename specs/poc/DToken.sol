pragma solidity ^0.8.0;

import "./Storage.sol";

contract DToken is Storage {
    function dTestLink() external view returns (address) {
        return upgradeAdmin;
    }
}