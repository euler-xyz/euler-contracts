// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./RiskManagerHarness.sol";
import "./ETokenHarness.sol";
import "./DTokenHarness.sol";

contract EulerHarness is Storage {
    RiskManagerHarness rm;
    ETokenHarness et;
    DTokenHarness dt;

    function mint(uint subAccountId, uint amount) external {
        (bool s, bytes memory d) = address(et).delegatecall(abi.encodeWithSelector(et.mint.selector, subAccountId, amount));
        require(s, string(d));
    }

    function et_balanceOf(address account) external returns (uint) {
        (bool s, bytes memory d) = address(et).delegatecall(abi.encodeWithSelector(et.balanceOf.selector, account));
        require(s, string(d));
        return abi.decode(d, (uint));
    }

    function dt_balanceOf(address account) external returns (uint) {
        (bool s, bytes memory d) = address(dt).delegatecall(abi.encodeWithSelector(dt.balanceOf.selector, account));
        require(s, string(d));
        return abi.decode(d, (uint));
    }

    function eTestLink() external returns (address) {
        (bool s, bytes memory d) = address(et).delegatecall(abi.encodeWithSelector(et.testLink.selector));
        require(s, string(d));
        return abi.decode(d, (address));
    }

    function getUpgradeAdmin() external view returns (address) {
        return upgradeAdmin;
    }
}