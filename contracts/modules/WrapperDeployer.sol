// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseModule.sol";
import "../wrappers/PToken.sol";
import "../wrappers/WEToken.sol";

contract WrapperDeployer is BaseModule {
    constructor(bytes32 moduleGitCommit_) BaseModule(MODULEID__WRAPPER_DEPLOYER, moduleGitCommit_) {}

    function deployPToken(address underlying) external returns (address) {
        return address(new PToken(address(this), underlying));
    }

    function deployWEToken(address eToken) external returns (address) {
        return address(new WEToken(address(this), eToken));
    }
}
