// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";

contract TestModule is BaseLogic {
    constructor(uint moduleId) BaseLogic(moduleId) {}

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
    
    // Test Log(0) -->Append log record wit no topics
    function testEmitViaProxyNoLog(address proxyAddr) external {
        emitViaProxy_NoTopics(proxyAddr);
    }

    // Test Log(1) -->Topic = function selector
    function testEmitViaProxyUnTrackAverageLiquidity(address proxyAddr) external {
        emitViaProxy_UnTrackAverageLiquidity(proxyAddr);
    }

    // Test Log(2)
    function testEmitViaProxyTrackAverageLiquidity(address proxyAddr, address account) external {
        emitViaProxy_TrackAverageLiquidity(proxyAddr, account);
    }
    // Test Log(3)
    function testEmitViaProxyTransfer(address proxyAddr, address from, address to, uint value) external {
        emitViaProxy_Transfer(proxyAddr, from, to, value);
    }

    // Test Log(3)
    function testEmitViaProxyApproval(address proxyAddr, address owner, address spender, uint value) external {
        emitViaProxy_Approval(proxyAddr, owner, spender, value);
    }
    
    // Test Log(4)
    function testEmitViaProxyLiquidation(address proxyAddr, address liquidator, address violator, 
        address underlying, address collateral, uint repay, 
        uint yield, uint healthScore, uint baseDiscount, uint discount)
        external {
            emitViaProxy_Liquidation(proxyAddr, liquidator,violator, underlying, collateral, repay, yield, healthScore, baseDiscount, discount);
     }
        
    // Test Log(4)
    function testEmitViaProxyRequestLiquidate(address proxyAddr, address liquidator,address violator, address underlying, address collateral,
        uint repay, uint minYield)
        external {
            emitViaProxy_RequestLiquidate(proxyAddr, liquidator, violator, underlying, collateral, repay, minYield);
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
    
    // Emit Logs via proxies functions

    function emitViaProxy_NoTopics(address proxyAddr) internal FREEMEM {
        (bool success,) = proxyAddr.call(abi.encodePacked(
                               uint8(0),
                               keccak256(bytes('NoTopics()'))    
                          ));
        require(success, "e/log-proxy-fail");
    }

    function emitViaProxy_UnTrackAverageLiquidity(address proxyAddr) internal FREEMEM {
        (bool success,) = proxyAddr.call(abi.encodePacked(
                               uint8(1),
                               keccak256(bytes('UnTrackAverageLiquidity()'))   
                          ));
        require(success, "e/log-proxy-fail");
    }

    function emitViaProxy_TrackAverageLiquidity(address proxyAddr, address account) internal FREEMEM {
        (bool success,) = proxyAddr.call(abi.encodePacked(
                               uint8(2),
                               keccak256(bytes('TrackAverageLiquidity(address)')),
                               bytes32(uint(uint160(account)))    
                          ));
        require(success, "e/log-proxy-fail");
    }

    function emitViaProxy_Liquidation(address proxyAddr, address liquidator, address violator, address underlying, address collateral, 
        uint repay, uint yield, uint healthScore, uint baseDiscount, uint discount) internal FREEMEM {
        (bool success,) = proxyAddr.call(abi.encodePacked(
                               uint8(4),
                               keccak256(bytes('Liquidation(address,address,address,address, uint256, uint256, uint256, uint256, uint256)')),
                               bytes32(uint(uint160(liquidator))),
                               bytes32(uint(uint160(violator))),
                               bytes32(uint(uint160(underlying))),
                               bytes32(uint(uint160(collateral))),
                               repay,
                               yield,
                               healthScore,
                               baseDiscount,
                               discount                         
                          ));
        require(success, "e/log-proxy-fail");
    }

    function emitViaProxy_RequestLiquidate(address proxyAddr, address liquidator, address violator, address underlying, address collateral, 
        uint repay, uint minYield) internal FREEMEM {
        (bool success,) = proxyAddr.call(abi.encodePacked(
                               uint8(4),
                               keccak256(bytes('RequestLiquidate(address,address,address,address, uint256, uint256, uint256)')),
                               bytes32(uint(uint160(liquidator))),
                               bytes32(uint(uint160(violator))),
                               bytes32(uint(uint160(underlying))),
                               bytes32(uint(uint160(collateral))),
                               repay,
                               minYield
                          ));
        require(success, "e/log-proxy-fail");
    }
}
