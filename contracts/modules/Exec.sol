// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


contract Exec is BaseLogic {
    constructor() BaseLogic(MODULEID__EXEC) {}


    // Accessors

    // These are not view methods, since they can perform state writes in the uniswap contract while retrieving prices

    function detailedLiquidity(address account) external nonReentrant returns (IRiskManager.AssetLiquidity[] memory assets) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeAssetLiquidities.selector, account));

        (assets) = abi.decode(result, (IRiskManager.AssetLiquidity[]));
    }

    function getPrice(address underlying) external nonReentrant returns (uint twap, uint twapPeriod, uint currPrice) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPrice.selector, underlying));

        (twap, twapPeriod, currPrice) = abi.decode(result, (uint, uint, uint));
    }


    // Custom execution methods

    function deferLiquidityCheck(address account) external {
        (, address msgSender) = unpackTrailingParams();

        require(!accountLookup[account].liquidityCheckInProgress, "e/defer/reentrancy");
        accountLookup[account].liquidityCheckInProgress = true;

        IDeferredLiquidityCheck(msgSender).onDeferredLiquidityCheck();

        accountLookup[account].liquidityCheckInProgress = false;

        checkLiquidity(account);
    }

    function batchDispatch(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks) external returns (EulerBatchItemResponse[] memory) {
        (, address msgSender) = unpackTrailingParams();

        for (uint i = 0; i < deferLiquidityChecks.length; i++) {
            address account = deferLiquidityChecks[i];

            require(!accountLookup[account].liquidityCheckInProgress, "e/batch/reentrancy");
            accountLookup[account].liquidityCheckInProgress = true;
        }


        EulerBatchItemResponse[] memory response = new EulerBatchItemResponse[](items.length);

        for (uint i = 0; i < items.length; i++) {
            uint destModuleId = trustedSenders[items[i].proxyAddr];
            require(destModuleId != 0, "e/batch/unknown-proxy-addr");
            require(destModuleId <= MAX_EXTERNAL_MODULEID, "e/batch/call-to-internal-module");
            address m = moduleLookup[destModuleId];

            bytes memory inputWrapped = abi.encodePacked(items[i].data, uint(uint160(items[i].proxyAddr)), uint(uint160(msgSender)));
            (bool success, bytes memory result) = m.delegatecall(inputWrapped);

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
}
