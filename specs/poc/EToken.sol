pragma solidity ^0.8.0;

import "./Storage.sol";
import "./DToken.sol";
import "./RiskManager.sol";

contract EToken is Storage {
    address self;
    DToken dt;

    function testLink() external returns (address) {
        (bool s, bytes memory d) = address(dt).delegatecall(abi.encodeWithSelector(dt.dTestLink.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }
}