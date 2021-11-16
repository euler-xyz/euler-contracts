// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";

contract TestModule is BaseLogic {
    constructor(uint moduleId) BaseLogic(moduleId, bytes32(0)) {}

    function setModuleId(address moduleAddr, uint32 id) external {
        trustedSenders[moduleAddr].moduleId = id;
    }

    function setModuleImpl(address moduleAddr, address impl) external {
        moduleLookup[trustedSenders[moduleAddr].moduleId] = impl;
        trustedSenders[moduleAddr].moduleImpl = impl;
    }

    function setPricingType(address eToken, uint16 val) external {
        eTokenLookup[eToken].pricingType = val;
    }

    function testCreateProxyOnInternalModule() external {
        _createProxy(MAX_EXTERNAL_MODULEID + 1);
    }

    function testDecreaseBorrow(address eToken, address account, uint amount) external {
        AssetStorage storage assetStorage = eTokenLookup[eToken];
        AssetCache memory assetCache = loadAssetCache(assetStorage.underlying, assetStorage);
        amount = decodeExternalAmount(assetCache, amount);
        decreaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, amount);
    }

    function testTransferBorrow(address eToken, address from, address to, uint amount) external {
        AssetStorage storage assetStorage = eTokenLookup[eToken];
        AssetCache memory assetCache = loadAssetCache(assetStorage.underlying, assetStorage);
        amount = decodeExternalAmount(assetCache, amount);
        transferBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, from, to, amount);
    }

    function testEmitViaProxyTransfer(address proxyAddr, address from, address to, uint value) external {
        emitViaProxy_Transfer(proxyAddr, from, to, value);
    }

    function testEmitViaProxyApproval(address proxyAddr, address owner, address spender, uint value) external {
        emitViaProxy_Approval(proxyAddr, owner, spender, value);
    }

    function testDispatchEmptyData() external {
        trustedSenders[address(this)].moduleId = 200;
        (bool success, bytes memory data) = address(this).call(abi.encodeWithSignature("dispatch()"));
        if (!success) revertBytes(data);
    }

    function testUnrecognizedETokenCaller() external {
        (bool success, bytes memory data) = moduleLookup[MODULEID__ETOKEN].delegatecall(abi.encodeWithSelector(IERC20.totalSupply.selector));
        if (!success) revertBytes(data);
    }

    function testUnrecognizedDTokenCaller() external {
        (bool success, bytes memory data) = moduleLookup[MODULEID__DTOKEN].delegatecall(abi.encodeWithSelector(IERC20.totalSupply.selector));
        if (!success) revertBytes(data);
    }

    function testCall() external {
        upgradeAdmin = upgradeAdmin; // suppress visibility warning
    }

    function issueLogToProxy(bytes memory payload) private {
        (, address proxyAddr) = unpackTrailingParams();
        (bool success,) = proxyAddr.call(payload);
        require(success, "e/log-proxy-fail");
    }

    function testProxyLogs() external {
        bytes memory extraData = "hello";

        issueLogToProxy(abi.encodePacked(
                               uint8(0),
                               extraData
                        ));

        issueLogToProxy(abi.encodePacked(
                               uint8(1),
                               bytes32(uint(1)),
                               extraData
                        ));

        issueLogToProxy(abi.encodePacked(
                               uint8(2),
                               bytes32(uint(1)),
                               bytes32(uint(2)),
                               extraData
                        ));

        issueLogToProxy(abi.encodePacked(
                               uint8(3),
                               bytes32(uint(1)),
                               bytes32(uint(2)),
                               bytes32(uint(3)),
                               extraData
                        ));

        issueLogToProxy(abi.encodePacked(
                               uint8(4),
                               bytes32(uint(1)),
                               bytes32(uint(2)),
                               bytes32(uint(3)),
                               bytes32(uint(4)),
                               extraData
                        ));
    }
}
