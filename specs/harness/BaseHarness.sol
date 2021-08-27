// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

contract BaseHarness {

    function requireCode(address _addr) external view {
        uint256 size;
        assembly {
            size := extcodesize(_addr)
        }

        require(size > 0, "no code");
    }
}