// SPDX-License-Identifier: GPL-2.0-or-later

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
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__EXEC, moduleGitCommit_) {}

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

    /// @notice Error containing results of a simulated batch dispatch
    error BatchDispatchSimulation(EulerBatchItemResponse[] simulation);

    // Accessors

    /// @notice Compute aggregate liquidity for an account
    /// @param account User address
    /// @return status Aggregate liquidity (sum of all entered assets)
    function liquidity(address account) external staticDelegate returns (IRiskManager.LiquidityStatus memory status) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeLiquidity.selector, account));

        (status) = abi.decode(result, (IRiskManager.LiquidityStatus));
    }

    /// @notice Compute detailed liquidity for an account, broken down by asset
    /// @param account User address
    /// @return assets List of user's entered assets and each asset's corresponding liquidity
    function detailedLiquidity(address account) public staticDelegate returns (IRiskManager.AssetLiquidity[] memory assets) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.computeAssetLiquidities.selector, account));

        (assets) = abi.decode(result, (IRiskManager.AssetLiquidity[]));
    }

    /// @notice Retrieve Euler's view of an asset's price
    /// @param underlying Token address
    /// @return twap Time-weighted average price
    /// @return twapPeriod TWAP duration, either the twapWindow value in AssetConfig, or less if that duration not available
    function getPrice(address underlying) external staticDelegate returns (uint twap, uint twapPeriod) {
        bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                 abi.encodeWithSelector(IRiskManager.getPrice.selector, underlying));

        (twap, twapPeriod) = abi.decode(result, (uint, uint));
    }

    /// @notice Retrieve Euler's view of an asset's price, as well as the current marginal price on uniswap
    /// @param underlying Token address
    /// @return twap Time-weighted average price
    /// @return twapPeriod TWAP duration, either the twapWindow value in AssetConfig, or less if that duration not available
    /// @return currPrice The current marginal price on uniswap3 (informational: not used anywhere in the Euler protocol)
    function getPriceFull(address underlying) external staticDelegate returns (uint twap, uint twapPeriod, uint currPrice) {
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

        require(accountLookup[account].deferLiquidityStatus == DEFERLIQUIDITY__NONE, "e/defer/reentrancy");
        accountLookup[account].deferLiquidityStatus = DEFERLIQUIDITY__CLEAN;

        IDeferredLiquidityCheck(msgSender).onDeferredLiquidityCheck(data);

        uint8 status = accountLookup[account].deferLiquidityStatus;
        accountLookup[account].deferLiquidityStatus = DEFERLIQUIDITY__NONE;

        if (status == DEFERLIQUIDITY__DIRTY) checkLiquidity(account);
    }

    /// @notice Execute several operations in a single transaction
    /// @param items List of operations to execute
    /// @param deferLiquidityChecks List of user accounts to defer liquidity checks for
    function batchDispatch(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks) external reentrantOK {
        doBatchDispatch(items, deferLiquidityChecks, false);
    }

    /// @notice Call batch dispatch, but instruct it to revert with the responses, before the liquidity checks.
    /// @param items List of operations to execute
    /// @param deferLiquidityChecks List of user accounts to defer liquidity checks for
    /// @dev During simulation all batch items are executed, regardless of the `allowError` flag
    function batchDispatchSimulate(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks) external reentrantOK {
        doBatchDispatch(items, deferLiquidityChecks, true);

        revert("e/batch/simulation-did-not-revert");
    }


    // Average liquidity tracking

    /// @notice Enable average liquidity tracking for your account. Operations will cost more gas, but you may get additional benefits when performing liquidations
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account. 
    /// @param delegate An address of another account that you would allow to use the benefits of your account's average liquidity (use the null address if you don't care about this). The other address must also reciprocally delegate to your account.
    /// @param onlyDelegate Set this flag to skip tracking average liquidity and only set the delegate.
    function trackAverageLiquidity(uint subAccountId, address delegate, bool onlyDelegate) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);
        require(account != delegate, "e/track-liquidity/self-delegation");

        emit DelegateAverageLiquidity(account, delegate);
        accountLookup[account].averageLiquidityDelegate = delegate;

        if (onlyDelegate) return;

        emit TrackAverageLiquidity(account);

        accountLookup[account].lastAverageLiquidityUpdate = uint40(block.timestamp);
        accountLookup[account].averageLiquidity = 0;
    }

    /// @notice Disable average liquidity tracking for your account and remove delegate
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account
    function unTrackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit UnTrackAverageLiquidity(account);
        emit DelegateAverageLiquidity(account, address(0));

        accountLookup[account].lastAverageLiquidityUpdate = 0;
        accountLookup[account].averageLiquidity = 0;
        accountLookup[account].averageLiquidityDelegate = address(0);
    }

    /// @notice Retrieve the average liquidity for an account
    /// @param account User account (xor in subAccountId, if applicable)
    /// @return The average liquidity, in terms of the reference asset, and post risk-adjustment
    function getAverageLiquidity(address account) external nonReentrant returns (uint) {
        return getUpdatedAverageLiquidity(account);
    }

    /// @notice Retrieve the average liquidity for an account or a delegate account, if set
    /// @param account User account (xor in subAccountId, if applicable)
    /// @return The average liquidity, in terms of the reference asset, and post risk-adjustment
    function getAverageLiquidityWithDelegate(address account) external nonReentrant returns (uint) {
        return getUpdatedAverageLiquidityWithDelegate(account);
    }

    /// @notice Retrieve the account which delegates average liquidity for an account, if set
    /// @param account User account (xor in subAccountId, if applicable)
    /// @return The average liquidity delegate account
    function getAverageLiquidityDelegateAccount(address account) external view returns (address) {
        address delegate = accountLookup[account].averageLiquidityDelegate;
        return accountLookup[delegate].averageLiquidityDelegate == account ? delegate : address(0);
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

    /// @notice Apply EIP2612 signed permit on a target token from sender to euler contract
    /// @param token Token address
    /// @param value Allowance value
    /// @param deadline Permit expiry timestamp
    /// @param v secp256k1 signature v
    /// @param r secp256k1 signature r
    /// @param s secp256k1 signature s
    function usePermit(address token, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        require(underlyingLookup[token].eTokenAddress != address(0), "e/exec/market-not-activated");
        address msgSender = unpackTrailingParamMsgSender();

        IERC20Permit(token).permit(msgSender, address(this), value, deadline, v, r, s);
    }

    /// @notice Apply DAI like (allowed) signed permit on a target token from sender to euler contract
    /// @param token Token address
    /// @param nonce Sender nonce
    /// @param expiry Permit expiry timestamp
    /// @param allowed If true, set unlimited allowance, otherwise set zero allowance
    /// @param v secp256k1 signature v
    /// @param r secp256k1 signature r
    /// @param s secp256k1 signature s
    function usePermitAllowed(address token, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s) external nonReentrant {
        require(underlyingLookup[token].eTokenAddress != address(0), "e/exec/market-not-activated");
        address msgSender = unpackTrailingParamMsgSender();

        IERC20Permit(token).permit(msgSender, address(this), nonce, expiry, allowed, v, r, s);
    }

    /// @notice Apply allowance to tokens expecting the signature packed in a single bytes param
    /// @param token Token address
    /// @param value Allowance value
    /// @param deadline Permit expiry timestamp
    /// @param signature secp256k1 signature encoded as rsv
    function usePermitPacked(address token, uint256 value, uint256 deadline, bytes calldata signature) external nonReentrant {
        require(underlyingLookup[token].eTokenAddress != address(0), "e/exec/market-not-activated");
        address msgSender = unpackTrailingParamMsgSender();

        IERC20Permit(token).permit(msgSender, address(this), value, deadline, signature);
    }

    /// @notice Execute a staticcall to an arbitrary address with an arbitrary payload.
    /// @param contractAddress Address of the contract to call
    /// @param payload Encoded call payload
    /// @return result Encoded return data
    /// @dev Intended to be used in static-called batches, to e.g. provide detailed information about the impacts of the simulated operation.
    function doStaticCall(address contractAddress, bytes memory payload) external view returns (bytes memory) {
        (bool success, bytes memory result) = contractAddress.staticcall(payload);
        if (!success) revertBytes(result);

        assembly {
            return(add(32, result), mload(result))
        }
    }

    function doBatchDispatch(EulerBatchItem[] calldata items, address[] calldata deferLiquidityChecks, bool revertResponse) private {
        address msgSender = unpackTrailingParamMsgSender();

        for (uint i = 0; i < deferLiquidityChecks.length; ++i) {
            address account = deferLiquidityChecks[i];

            require(accountLookup[account].deferLiquidityStatus == DEFERLIQUIDITY__NONE, "e/batch/reentrancy");
            accountLookup[account].deferLiquidityStatus = DEFERLIQUIDITY__CLEAN;
        }


        EulerBatchItemResponse[] memory response;
        if (revertResponse) response = new EulerBatchItemResponse[](items.length);

        for (uint i = 0; i < items.length; ++i) {
            EulerBatchItem calldata item = items[i];
            address proxyAddr = item.proxyAddr;

            uint32 moduleId = trustedSenders[proxyAddr].moduleId;
            address moduleImpl = trustedSenders[proxyAddr].moduleImpl;

            require(moduleId != 0, "e/batch/unknown-proxy-addr");
            require(moduleId <= MAX_EXTERNAL_MODULEID, "e/batch/call-to-internal-module");

            if (moduleImpl == address(0)) moduleImpl = moduleLookup[moduleId];
            require(moduleImpl != address(0), "e/batch/module-not-installed");

            bytes memory inputWrapped = abi.encodePacked(item.data, uint160(msgSender), uint160(proxyAddr));
            (bool success, bytes memory result) = moduleImpl.delegatecall(inputWrapped);

            if (revertResponse) {
                EulerBatchItemResponse memory r = response[i];
                r.success = success;
                r.result = result;
            } else if (!(success || item.allowError)) {
                revertBytes(result);
            }
        }

        if (revertResponse) revert BatchDispatchSimulation(response);

        for (uint i = 0; i < deferLiquidityChecks.length; ++i) {
            address account = deferLiquidityChecks[i];

            uint8 status = accountLookup[account].deferLiquidityStatus;
            accountLookup[account].deferLiquidityStatus = DEFERLIQUIDITY__NONE;

            if (status == DEFERLIQUIDITY__DIRTY) checkLiquidity(account);
        }
    }
}
