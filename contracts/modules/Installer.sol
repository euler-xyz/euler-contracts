// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Installer is BaseLogic {
    constructor() BaseLogic(MODULEID__INSTALLER) {}

    modifier adminOnly {
        address msgSender = unpackTrailingParamMsgSender();
        require(msgSender == upgradeAdmin, "e/installer/unauthorized");
        _;
    }

    struct ModuleInstallParam {
        uint moduleId;
        address implementation;
    }

    function install(ModuleInstallParam[] memory params) external adminOnly {
        for (uint i = 0; i < params.length; i++) {
            ModuleInstallParam memory param = params[i];
            require(IModule(param.implementation).moduleId() == param.moduleId, "e/installer/moduleId-mismatch");
            moduleLookup[param.moduleId] = param.implementation;
        }
    }

    function createProxies(uint[] calldata moduleIds) external adminOnly returns (address[] memory) {
        address[] memory output = new address[](moduleIds.length);

        for (uint i = 0; i < moduleIds.length; i++) {
            output[i] = _createProxy(moduleIds[i]);
        }

        return output;
    }
}
