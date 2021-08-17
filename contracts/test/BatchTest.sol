// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseModule.sol";


contract BatchTest is BaseModule {
    constructor() BaseModule(100) {}

    function setModuleId(address moduleAddr, uint32 id) external {
        trustedSenders[moduleAddr].moduleId = id;
    }

    function setModuleImpl(address moduleAddr, address impl) external {
        moduleLookup[trustedSenders[moduleAddr].moduleId] = impl;
        trustedSenders[moduleAddr].moduleImpl = impl;
    }

    function testCall() external {
        upgradeAdmin = upgradeAdmin; // suppress visibility warning
    }
}
