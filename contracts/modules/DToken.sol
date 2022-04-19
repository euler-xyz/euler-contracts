// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


/// @notice Definition of callback method that flashLoan will invoke on your contract
interface IFlashLoan {
    function onFlashLoan(bytes memory data) external;
}


/// @notice Tokenised representation of debts
contract DToken is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__DTOKEN, moduleGitCommit_) {}

    function CALLER() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        address eTokenAddress = dTokenLookup[proxyAddr];
        require(eTokenAddress != address(0), "e/unrecognized-dtoken-caller");
        assetStorage = eTokenLookup[eTokenAddress];
        underlying = assetStorage.underlying;
    }


    // Events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);



    // External methods

    /// @notice Debt token name, ie "Euler Debt: DAI"
    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Debt: ", IERC20(underlying).name()));
    }

    /// @notice Debt token symbol, ie "dDAI"
    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("d", IERC20(underlying).symbol()));
    }

    /// @notice Decimals of underlying
    function decimals() external view returns (uint8) {
        (,AssetStorage storage assetStorage,,) = CALLER();
        return assetStorage.underlyingDecimals;
    }

    /// @notice Address of underlying asset
    function underlyingAsset() external view returns (address) {
        (address underlying,,,) = CALLER();
        return underlying;
    }


    /// @notice Sum of all outstanding debts, in underlying units (increases as interest is accrued)
    function totalSupply() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return assetCache.totalBorrows / INTERNAL_DEBT_PRECISION / assetCache.underlyingDecimalsScaler;
    }

    /// @notice Sum of all outstanding debts, in underlying units normalized to 27 decimals (increases as interest is accrued)
    function totalSupplyExact() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return assetCache.totalBorrows;
    }


    /// @notice Debt owed by a particular account, in underlying units
    function balanceOf(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return getCurrentOwed(assetStorage, assetCache, account) / assetCache.underlyingDecimalsScaler;
    }

    /// @notice Debt owed by a particular account, in underlying units normalized to 27 decimals
    function balanceOfExact(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return getCurrentOwedExact(assetStorage, assetCache, account, assetStorage.users[account].owed);
    }


    /// @notice Transfer underlying tokens from the Euler pool to the sender, and increase sender's dTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for all available tokens)
    function borrow(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestBorrow(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) {
            amount = assetCache.poolSize;
        } else {
            amount = decodeExternalAmount(assetCache, amount);
        }

        require(amount <= assetCache.poolSize, "e/insufficient-tokens-available");

        pushTokens(assetCache, msgSender, amount);

        increaseBorrow(assetStorage, assetCache, proxyAddr, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }

    /// @notice Transfer underlying tokens from the sender to the Euler pool, and decrease sender's dTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for full debt owed)
    function repay(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestRepay(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount != type(uint).max) {
            amount = decodeExternalAmount(assetCache, amount);
        }

        uint owed = getCurrentOwed(assetStorage, assetCache, account);
        if (owed == 0) return;
        if (amount > owed) amount = owed;

        amount = pullTokens(assetCache, msgSender, amount);

        decreaseBorrow(assetStorage, assetCache, proxyAddr, account, amount);

        logAssetStatus(assetCache);
    }


    /// @notice Request a flash-loan. A onFlashLoan() callback in msg.sender will be invoked, which must repay the loan to the main Euler address prior to returning.
    /// @param amount In underlying units
    /// @param data Passed through to the onFlashLoan() callback, so contracts don't need to store transient data in storage
    function flashLoan(uint amount, bytes calldata data) external nonReentrant {
        (address underlying,,, address msgSender) = CALLER();

        uint origBalance = IERC20(underlying).balanceOf(address(this));

        Utils.safeTransfer(underlying, msgSender, amount);

        IFlashLoan(msgSender).onFlashLoan(data);

        require(IERC20(underlying).balanceOf(address(this)) >= origBalance, "e/flash-loan-not-repaid");
    }


    /// @notice Allow spender to send an amount of dTokens to a particular sub-account
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param spender Trusted address
    /// @param amount In underlying units (use max uint256 for "infinite" allowance)
    function approveDebt(uint subAccountId, address spender, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        require(!isSubAccountOf(spender, account), "e/self-approval");

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        assetStorage.dTokenAllowance[account][spender] = amount == type(uint).max ? type(uint).max : decodeExternalAmount(assetCache, amount);

        emitViaProxy_Approval(proxyAddr, account, spender, amount);

        return true;
    }

    /// @notice Retrieve the current debt allowance
    /// @param holder Xor with the desired sub-account ID (if applicable)
    /// @param spender Trusted address
    function debtAllowance(address holder, address spender) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        uint allowance = assetStorage.dTokenAllowance[holder][spender];

        return allowance == type(uint).max ? type(uint).max : allowance / assetCache.underlyingDecimalsScaler;
    }



    /// @notice Transfer dTokens to another address (from sub-account 0)
    /// @param to Xor with the desired sub-account ID (if applicable)
    /// @param amount In underlying units. Use max uint256 for full balance.
    function transfer(address to, uint amount) external reentrantOK returns (bool) {
        return transferFrom(address(0), to, amount);
    }

    /// @notice Transfer dTokens from one address to another
    /// @param from Xor with the desired sub-account ID (if applicable)
    /// @param to This address must've approved the from address, or be a sub-account of msg.sender
    /// @param amount In underlying units. Use max uint256 for full balance.
    function transferFrom(address from, address to, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        updateAverageLiquidity(from);
        updateAverageLiquidity(to);
        emit RequestTransferDToken(from, to, amount);

        if (amount == type(uint).max) amount = getCurrentOwed(assetStorage, assetCache, from);
        else amount = decodeExternalAmount(assetCache, amount);

        if (amount == 0) return true;

        if (!isSubAccountOf(msgSender, to) && assetStorage.dTokenAllowance[to][msgSender] != type(uint).max) {
            require(assetStorage.dTokenAllowance[to][msgSender] >= amount, "e/insufficient-debt-allowance");
            unchecked { assetStorage.dTokenAllowance[to][msgSender] -= amount; }
            emitViaProxy_Approval(proxyAddr, to, msgSender, assetStorage.dTokenAllowance[to][msgSender] / assetCache.underlyingDecimalsScaler);
        }

        transferBorrow(assetStorage, assetCache, proxyAddr, from, to, amount);

        checkLiquidity(to);
        logAssetStatus(assetCache);

        return true;
    }
}
