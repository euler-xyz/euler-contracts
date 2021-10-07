// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./BaseModule.sol";

abstract contract BaseIRM is BaseModule {

    function computeInterestRate(address, uint32) external virtual returns (int96);

    function reset(address underlying, bytes calldata resetParams) external {}
}
