// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";


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

    function deferLiquidityCheck(address account) external reentrantOK {
        address msgSender = unpackTrailingParamMsgSender();

        require(!accountLookup[account].liquidityCheckInProgress, "e/defer/reentrancy");
        accountLookup[account].liquidityCheckInProgress = true;

        IDeferredLiquidityCheck(msgSender).onDeferredLiquidityCheck();

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

            require(moduleId != 0, "e/unknown-proxy-addr");
            require(moduleId <= MAX_EXTERNAL_MODULEID, "e/batch/call-to-internal-module");

            if (moduleImpl == address(0)) moduleImpl = moduleLookup[moduleId];
            require(moduleImpl != address(0), "e/module-not-installed");

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



    // FIXME: Find better module for these to live in

    function selfBorrow(address underlying, uint subAccountId, uint amount) external nonReentrant {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);
        address dTokenAddress = assetStorage.dTokenAddress;

        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);


        amount *= assetCache.underlyingDecimalsScaler;
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");


        // Mint ETokens

        {
            uint amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
            increaseBalance(assetStorage, assetCache, account, amountInternal);

            emit Deposit(underlying, account, amount);
            emitViaProxy_Transfer(eTokenAddress, address(0), account, amountInternal);
        }


        // Mint DTokens

        increaseBorrow(assetStorage, assetCache, account, amount);

        emit Borrow(underlying, account, amount);
        emitViaProxy_Transfer(dTokenAddress, address(0), account, amount);


        checkLiquidity(account);
    }

    function selfRepay(address underlying, uint subAccountId, uint amount) external nonReentrant {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);
        address dTokenAddress = assetStorage.dTokenAddress;

        (address msgSender,) = unpackTrailingParams();
        address account = getSubAccount(msgSender, subAccountId);


        if (amount != type(uint).max) {
            amount *= assetCache.underlyingDecimalsScaler;
        }

        uint owed = getCurrentOwed(assetStorage, assetCache, account) / INTERNAL_DEBT_PRECISION;
        if (amount > owed) amount = owed;
        if (owed == 0) return;

        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");


        // Burn ETokens

        {
            uint amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
            decreaseBalance(assetStorage, assetCache, account, amountInternal);

            emit Withdraw(underlying, account, amount);
            emitViaProxy_Transfer(eTokenAddress, account, address(0), amountInternal);
        }


        // Burn DTokens

        decreaseBorrow(assetStorage, assetCache, account, amount);

        emit Repay(underlying, account, amount);
        emitViaProxy_Transfer(dTokenAddress, account, address(0), amount);


        checkLiquidity(account); // FIXME: not necessary under current assumptions?
    }
}
