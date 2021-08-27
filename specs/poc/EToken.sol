pragma solidity ^0.8.0;

import "./Storage.sol";
import "./DToken.sol";
import "./RiskManager.sol";

contract EToken is Storage {

    function testLink() external returns (address) {
        (bool s, bytes memory d) = dt.delegatecall(abi.encodeWithSelector(DToken.dTestLink.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }
}