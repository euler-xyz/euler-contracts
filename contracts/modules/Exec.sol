// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../IRiskManager.sol";


interface IDeferredLiquidityCheck {
    function onDeferredLiquidityCheck(bytes memory data) external;
}

struct EulerBatchItem {
    bool allowError;
    address proxyAddr;
    bytes data;
}

struct EulerBatchItemResponse {
    bool success;
    bytes result;
}


contract Exec is BaseLogic {
    constructor() BaseLogic(MODULEID__EXEC) {}

    // Accessors

    // These are not view methods, since they can perform state writes in the uniswap contract while retrieving prices

    function liquidity(address account) external nonReentrant returns (IRiskManager.LiquidityStatus memory status) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeLiquidity.selector, account));

        (status) = abi.decode(result, (IRiskManager.LiquidityStatus));
    }

    function detailedLiquidity(address account) external nonReentrant returns (IRiskManager.AssetLiquidity[] memory assets) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeAssetLiquidities.selector, account));

        (assets) = abi.decode(result, (IRiskManager.AssetLiquidity[]));
    }

    function getPriceFull(address underlying) external nonReentrant returns (uint twap, uint twapPeriod, uint currPrice) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPriceFull.selector, underlying));

        (twap, twapPeriod, currPrice) = abi.decode(result, (uint, uint, uint));
    }


    // Custom execution methods

    function deferLiquidityCheck(address account, bytes memory data) external reentrantOK {
        address msgSender = unpackTrailingParamMsgSender();

        require(!accountLookup[account].liquidityCheckInProgress, "e/defer/reentrancy");
        accountLookup[account].liquidityCheckInProgress = true;

        IDeferredLiquidityCheck(msgSender).onDeferredLiquidityCheck(data);

        accountLookup[account].liquidityCheckInProgress = false;

        checkLiquidity(account);
    }

    function batchDispatch(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks) external reentrantOK returns (EulerBatchItemResponse[] memory) {
        address msgSender = unpackTrailingParamMsgSender();

        for (uint i = 0; i < deferLiquidityChecks.length; i++) {
            address account = deferLiquidityChecks[i];

            require(!accountLookup[account].liquidityCheckInProgress, "e/batch/reentrancy");
            accountLookup[account].liquidityCheckInProgress = true;
        }


        EulerBatchItemResponse[] memory response = new EulerBatchItemResponse[](items.length);

        for (uint i = 0; i < items.length; i++) {
            uint32 moduleId = trustedSenders[items[i].proxyAddr].moduleId;
            address moduleImpl = trustedSenders[items[i].proxyAddr].moduleImpl;

            require(moduleId != 0, "e/batch/unknown-proxy-addr");
            require(moduleId <= MAX_EXTERNAL_MODULEID, "e/batch/call-to-internal-module");

            if (moduleImpl == address(0)) moduleImpl = moduleLookup[moduleId];
            require(moduleImpl != address(0), "e/batch/module-not-installed");

            bytes memory inputWrapped = abi.encodePacked(items[i].data, uint160(msgSender), uint160(items[i].proxyAddr));
            (bool success, bytes memory result) = moduleImpl.delegatecall(inputWrapped);

            if (success || items[i].allowError) {
                response[i].success = success;
                response[i].result = result;
            } else {
                revertBytes(result);
            }
        }


        for (uint i = 0; i < deferLiquidityChecks.length; i++) {
            address account = deferLiquidityChecks[i];

            accountLookup[account].liquidityCheckInProgress = false;

            checkLiquidity(account);
        }

        return response;
    }



    // Average liquidity tracking

    function trackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);
        accountLookup[account].lastAverageLiquidityUpdate = uint40(block.timestamp);
        accountLookup[account].averageLiquidity = 0;
    }

    function unTrackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);
        accountLookup[account].lastAverageLiquidityUpdate = 0;
        accountLookup[account].averageLiquidity = 0;
    }

    function getAverageLiquidity(address account) external nonReentrant returns (uint) {
        return getUpdatedAverageLiquidity(account);
    }
}
