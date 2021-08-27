pragma solidity ^0.8.0;

import "./Storage.sol";
import "./EToken.sol";
import "./DToken.sol";


contract Euler is Storage {

    function eTestLink() external returns (address) {
        (bool s, bytes memory d) = et.delegatecall(abi.encodeWithSelector(EToken.testLink.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }
}