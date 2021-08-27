pragma solidity ^0.8.0;

import "./Storage.sol";
import "./EToken.sol";
import "./DToken.sol";


contract Euler is Storage {
    EToken et;
    DToken dt;

    function eTestLink() external returns (address) {
        (bool s, bytes memory d) = address(et).delegatecall(abi.encodeWithSelector(et.testLink.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }
}