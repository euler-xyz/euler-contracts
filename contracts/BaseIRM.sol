// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./BaseModule.sol";


// This module is only for dev/testing purposes.

abstract contract BaseIRM is BaseModule {
    constructor(uint moduleId_) BaseModule(moduleId_) {}

    function computeInterestRate(address, uint32, uint32, int96, uint) external virtual returns (int96);

    function reset(address underlying, bytes calldata resetParams) external {}
}
