// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../IRiskManager.sol";
import "../PToken.sol";
import "../Interfaces.sol";
import "../Utils.sol";


/// @notice Definition of callback method that deferLiquidityCheck will invoke on your contract
interface IDeferredLiquidityCheck {
    function onDeferredLiquidityCheck(bytes memory data) external;
}


/// @notice Batch executions, liquidity check deferrals, and interfaces to fetch prices and account liquidity
contract Exec is BaseLogic {
    constructor() BaseLogic(MODULEID__EXEC) {}

    /// @notice Single item in a batch request
    struct EulerBatchItem {
        bool allowError;
        address proxyAddr;
        bytes data;
    }

    /// @notice Single item in a batch response
    struct EulerBatchItemResponse {
        bool success;
        bytes result;
    }

    // Accessors

    // These are not view methods, since they can perform state writes in the uniswap contract while retrieving prices

    /// @notice Compute aggregate liquidity for an account
    /// @param account User address
    /// @return status Aggregate liquidity (sum of all entered assets)
    function liquidity(address account) external nonReentrant returns (IRiskManager.LiquidityStatus memory status) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeLiquidity.selector, account));

        (status) = abi.decode(result, (IRiskManager.LiquidityStatus));
    }

    /// @notice Compute detailed liquidity for an account, broken down by asset
    /// @param account User address
    /// @return assets List of user's entered assets and each asset's corresponding liquidity
    function detailedLiquidity(address account) public nonReentrant returns (IRiskManager.AssetLiquidity[] memory assets) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeAssetLiquidities.selector, account));

        (assets) = abi.decode(result, (IRiskManager.AssetLiquidity[]));
    }

    /// @notice Retrieve Euler's view of an asset's price
    /// @param underlying Token address
    /// @return twap Time-weighted average price
    /// @return twapPeriod TWAP duration, either the twapWindow value in AssetConfig, or less if that duration not available
    function getPrice(address underlying) external nonReentrant returns (uint twap, uint twapPeriod) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPrice.selector, underlying));

        (twap, twapPeriod) = abi.decode(result, (uint, uint));
    }

    /// @notice Retrieve Euler's view of an asset's price, as well as the current marginal price on uniswap
    /// @param underlying Token address
    /// @return twap Time-weighted average price
    /// @return twapPeriod TWAP duration, either the twapWindow value in AssetConfig, or less if that duration not available
    /// @return currPrice The current marginal price on uniswap3 (informational: not used anywhere in the Euler protocol)
    function getPriceFull(address underlying) external nonReentrant returns (uint twap, uint twapPeriod, uint currPrice) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPriceFull.selector, underlying));

        (twap, twapPeriod, currPrice) = abi.decode(result, (uint, uint, uint));
    }


    // Custom execution methods

    /// @notice Defer liquidity checking for an account, to perform rebalancing, flash loans, etc. msg.sender must implement IDeferredLiquidityCheck
    /// @param account The account to defer liquidity for. Usually address(this), although not always
    /// @param data Passed through to the onDeferredLiquidityCheck() callback, so contracts don't need to store transient data in storage
    function deferLiquidityCheck(address account, bytes memory data) external reentrantOK {
        address msgSender = unpackTrailingParamMsgSender();

        require(!accountLookup[account].liquidityCheckInProgress, "e/defer/reentrancy");
        accountLookup[account].liquidityCheckInProgress = true;

        IDeferredLiquidityCheck(msgSender).onDeferredLiquidityCheck(data);

        accountLookup[account].liquidityCheckInProgress = false;

        checkLiquidity(account);
    }

    /// @notice Execute several operations in a single transaction
    /// @param items List of operations to execute
    /// @param deferLiquidityChecks List of user accounts to defer liquidity checks for
    /// @return List of operation results
    function batchDispatch(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks) public reentrantOK returns (EulerBatchItemResponse[] memory) {
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

    /// @notice Results of a batchDispatch, but with extra information
    struct EulerBatchExtra {
        EulerBatchItemResponse[] responses;
        uint gasUsed;
        IRiskManager.AssetLiquidity[][] liquidities;
    }

    /// @notice Call batchDispatch, but return extra information. Only intended to be used with callStatic.
    /// @param items List of operations to execute
    /// @param deferLiquidityChecks List of user accounts to defer liquidity checks for
    /// @param queryLiquidity List of user accounts to return detailed liquidity information for
    /// @return output Structure with extra information
    function batchDispatchExtra(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks, address[] calldata queryLiquidity) external reentrantOK returns (EulerBatchExtra memory output) {
        {
            uint origGasLeft = gasleft();
            output.responses = batchDispatch(items, deferLiquidityChecks);
            output.gasUsed = origGasLeft - gasleft();
        }

        output.liquidities = new IRiskManager.AssetLiquidity[][](queryLiquidity.length);

        for (uint i = 0; i < queryLiquidity.length; i++) {
            output.liquidities[i] = detailedLiquidity(queryLiquidity[i]);
        }
    }


    // Average liquidity tracking

    /// @notice Enable average liquidity tracking for your account and/or declare linked account. Operations will cost more gas, but you may get additional benefits when performing liquidations
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account
    /// @param linkedAccount an optional address to link average liquidity for liquidation bonus
    function trackAverageLiquidity(uint subAccountId, address linkedAccount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);
        require(account != linkedAccount, "e/track-liquidity/self-link");

        if (accountLookup[account].lastAverageLiquidityUpdate == 0)
            emit TrackAverageLiquidity(account);

        accountLookup[account].lastAverageLiquidityUpdate = uint40(block.timestamp);
        accountLookup[account].averageLiquidity = 0;

        address prevLinkedAccount = getAverageLiquidityLinkedAccount(account);
        if (prevLinkedAccount == linkedAccount) return;

        if (prevLinkedAccount != address(0))
            emit UnlinkAverageLiquidityTracking(account, prevLinkedAccount);

        accountLookup[account].averageLiquidityLinkedAccount = linkedAccount;
        if (accountLookup[linkedAccount].averageLiquidityLinkedAccount == account)
            emit LinkAverageLiquidityTracking(account, linkedAccount);
    }

    /// @notice Disable average liquidity tracking for your account
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account
    function unTrackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit UnTrackAverageLiquidity(account);

        accountLookup[account].lastAverageLiquidityUpdate = 0;
        accountLookup[account].averageLiquidity = 0;
        accountLookup[account].averageLiquidityLinkedAccount = address(0);
    }

    /// @notice Retrieve the average liquidity for an account
    /// @param account User account (xor in subAccountId, if applicable)
    /// @return The average liquidity, in terms of the reference asset, and post risk-adjustment
    function getAverageLiquidity(address account) external nonReentrant returns (uint) {
        return getUpdatedAverageLiquidity(account);
    }

    /// @notice Retrive the address of an effectively linked account for average liquidity tracking
    /// @param account User account (xor in subAccountId, if applicable)
    /// @return Address of average liquidity linked account
    function getLiquidityLinkedAccount(address account) external nonReentrant returns (address) {
        return getAverageLiquidityLinkedAccount(account);
    }




    // PToken wrapping/unwrapping

    /// @notice Transfer underlying tokens from sender's wallet into the pToken wrapper. Allowance should be set for the euler address.
    /// @param underlying Token address
    /// @param amount The amount to wrap in underlying units
    function pTokenWrap(address underlying, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();

        emit PTokenWrap(underlying, msgSender, amount);

        address pTokenAddr = reversePTokenLookup[underlying];
        require(pTokenAddr != address(0), "e/exec/ptoken-not-found");

        {
            uint origBalance = IERC20(underlying).balanceOf(pTokenAddr);
            Utils.safeTransferFrom(underlying, msgSender, pTokenAddr, amount);
            uint newBalance = IERC20(underlying).balanceOf(pTokenAddr);
            require(newBalance == origBalance + amount, "e/exec/ptoken-transfer-mismatch");
        }

        PToken(pTokenAddr).claimSurplus(msgSender);
    }

    /// @notice Transfer underlying tokens from the pToken wrapper to the sender's wallet.
    /// @param underlying Token address
    /// @param amount The amount to unwrap in underlying units
    function pTokenUnWrap(address underlying, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();

        emit PTokenUnWrap(underlying, msgSender, amount);

        address pTokenAddr = reversePTokenLookup[underlying];
        require(pTokenAddr != address(0), "e/exec/ptoken-not-found");

        PToken(pTokenAddr).forceUnwrap(msgSender, amount);
    }
}
