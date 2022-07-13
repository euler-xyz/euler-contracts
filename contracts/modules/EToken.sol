// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


/// @notice Tokenised representation of assets
contract EToken is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__ETOKEN, moduleGitCommit_) {}

    function CALLER() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        assetStorage = eTokenLookup[proxyAddr];
        underlying = assetStorage.underlying;
        require(underlying != address(0), "e/unrecognized-etoken-caller");
    }


    // Events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);



    // External methods

    /// @notice Pool name, ie "Euler Pool: DAI"
    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Pool: ", IERC20(underlying).name()));
    }

    /// @notice Pool symbol, ie "eDAI"
    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("e", IERC20(underlying).symbol()));
    }

    /// @notice Decimals, always normalised to 18.
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /// @notice Address of underlying asset
    function underlyingAsset() external view returns (address) {
        (address underlying,,,) = CALLER();
        return underlying;
    }



    /// @notice Sum of all balances, in internal book-keeping units (non-increasing)
    function totalSupply() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return assetCache.totalBalances;
    }

    /// @notice Sum of all balances, in underlying units (increases as interest is earned)
    function totalSupplyUnderlying() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, assetCache.totalBalances) / assetCache.underlyingDecimalsScaler;
    }


    /// @notice Balance of a particular account, in internal book-keeping units (non-increasing)
    function balanceOf(address account) external view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.users[account].balance;
    }

    /// @notice Balance of a particular account, in underlying units (increases as interest is earned)
    function balanceOfUnderlying(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, assetStorage.users[account].balance) / assetCache.underlyingDecimalsScaler;
    }


    /// @notice Balance of the reserves, in internal book-keeping units (non-increasing)
    function reserveBalance() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return assetCache.reserveBalance;
    }

    /// @notice Balance of the reserves, in underlying units (increases as interest is earned)
    function reserveBalanceUnderlying() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, assetCache.reserveBalance) / assetCache.underlyingDecimalsScaler;
    }


    /// @notice Convert an eToken balance to an underlying amount, taking into account current exchange rate
    /// @param balance eToken balance, in internal book-keeping units (18 decimals)
    /// @return Amount in underlying units, (same decimals as underlying token)
    function convertBalanceToUnderlying(uint balance) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, balance) / assetCache.underlyingDecimalsScaler;
    }

    /// @notice Convert an underlying amount to an eToken balance, taking into account current exchange rate
    /// @param underlyingAmount Amount in underlying units (same decimals as underlying token)
    /// @return eToken balance, in internal book-keeping units (18 decimals)
    function convertUnderlyingToBalance(uint underlyingAmount) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

        return underlyingAmountToBalance(assetCache, decodeExternalAmount(assetCache, underlyingAmount));
    }


    /// @notice Updates interest accumulator and totalBorrows, credits reserves, re-targets interest rate, and logs asset status
    function touch() external nonReentrant {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        updateInterestRate(assetStorage, assetCache);

        logAssetStatus(assetCache);
    }


    /// @notice Transfer underlying tokens from sender to the Euler pool, and increase account's eTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for full underlying token balance)
    function deposit(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestDeposit(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) {
            amount = callBalanceOf(assetCache, msgSender);
        }

        amount = decodeExternalAmount(assetCache, amount);

        uint amountTransferred = pullTokens(assetCache, msgSender, amount);
        uint amountInternal;

        // pullTokens() updates poolSize in the cache, but we need the poolSize before the deposit to determine
        // the internal amount so temporarily reduce it by the amountTransferred (which is size checked within
        // pullTokens()). We can't compute this value before the pull because we don't know how much we'll
        // actually receive (the token might be deflationary).

        unchecked {
            assetCache.poolSize -= amountTransferred;
            amountInternal = underlyingAmountToBalance(assetCache, amountTransferred);
            assetCache.poolSize += amountTransferred;
        }

        increaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        if (assetStorage.users[account].owed != 0) checkLiquidity(account);

        logAssetStatus(assetCache);
    }

    /// @notice Transfer underlying tokens from Euler pool to sender, and decrease account's eTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for full pool balance)
    function withdraw(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestWithdraw(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint amountInternal;
        (amount, amountInternal) = withdrawAmounts(assetStorage, assetCache, account, amount);
        require(assetCache.poolSize >= amount, "e/insufficient-pool-size");

        pushTokens(assetCache, msgSender, amount);

        decreaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        checkLiquidity(account);

        logAssetStatus(assetCache);
    }


    /// @notice Mint eTokens and a corresponding amount of dTokens ("self-borrow")
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units
    function mint(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestMint(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        amount = decodeExternalAmount(assetCache, amount);
        uint amountInternal = underlyingAmountToBalanceRoundUp(assetCache, amount);
        amount = balanceToUnderlyingAmount(assetCache, amountInternal);

        // Mint ETokens

        increaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        // Mint DTokens

        increaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }

    /// @notice Pay off dToken liability with eTokens ("self-repay")
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 to repay the debt in full or up to the available underlying balance)
    function burn(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestBurn(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint owed = getCurrentOwed(assetStorage, assetCache, account);
        if (owed == 0) return;

        uint amountInternal;
        (amount, amountInternal) = withdrawAmounts(assetStorage, assetCache, account, amount);

        if (amount > owed) {
            amount = owed;
            amountInternal = underlyingAmountToBalanceRoundUp(assetCache, amount);
        }

        // Burn ETokens

        decreaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        // Burn DTokens

        decreaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }



    /// @notice Allow spender to access an amount of your eTokens in sub-account 0
    /// @param spender Trusted address
    /// @param amount Use max uint256 for "infinite" allowance
    function approve(address spender, uint amount) external reentrantOK returns (bool) {
        return approveSubAccount(0, spender, amount);
    }

    /// @notice Allow spender to access an amount of your eTokens in a particular sub-account
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param spender Trusted address
    /// @param amount Use max uint256 for "infinite" allowance
    function approveSubAccount(uint subAccountId, address spender, uint amount) public nonReentrant returns (bool) {
        (, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        require(!isSubAccountOf(spender, account), "e/self-approval");

        assetStorage.eTokenAllowance[account][spender] = amount;
        emitViaProxy_Approval(proxyAddr, account, spender, amount);

        return true;
    }

    /// @notice Retrieve the current allowance
    /// @param holder Xor with the desired sub-account ID (if applicable)
    /// @param spender Trusted address
    function allowance(address holder, address spender) external view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.eTokenAllowance[holder][spender];
    }




    /// @notice Transfer eTokens to another address (from sub-account 0)
    /// @param to Xor with the desired sub-account ID (if applicable)
    /// @param amount In internal book-keeping units (as returned from balanceOf).
    function transfer(address to, uint amount) external reentrantOK returns (bool) {
        return transferFrom(address(0), to, amount);
    }

    /// @notice Transfer the full eToken balance of an address to another
    /// @param from This address must've approved the to address, or be a sub-account of msg.sender
    /// @param to Xor with the desired sub-account ID (if applicable)
    function transferFromMax(address from, address to) external reentrantOK returns (bool) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return transferFrom(from, to, assetStorage.users[from].balance);
    }

    /// @notice Transfer eTokens from one address to another
    /// @param from This address must've approved the to address, or be a sub-account of msg.sender
    /// @param to Xor with the desired sub-account ID (if applicable)
    /// @param amount In internal book-keeping units (as returned from balanceOf).
    function transferFrom(address from, address to, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        updateAverageLiquidity(from);
        updateAverageLiquidity(to);
        emit RequestTransferEToken(from, to, amount);

        if (amount == 0) return true;

        if (!isSubAccountOf(msgSender, from) && assetStorage.eTokenAllowance[from][msgSender] != type(uint).max) {
            require(assetStorage.eTokenAllowance[from][msgSender] >= amount, "e/insufficient-allowance");
            unchecked { assetStorage.eTokenAllowance[from][msgSender] -= amount; }
            emitViaProxy_Approval(proxyAddr, from, msgSender, assetStorage.eTokenAllowance[from][msgSender]);
        }

        transferBalance(assetStorage, assetCache, proxyAddr, from, to, amount);

        checkLiquidity(from);
        if (assetStorage.users[to].owed != 0) checkLiquidity(to);

        logAssetStatus(assetCache);

        return true;
    }

    /// @notice Donate eTokens to the reserves
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In internal book-keeping units (as returned from balanceOf).
    function donateToReserves(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestDonate(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint origBalance = assetStorage.users[account].balance;
        uint newBalance;

        if (amount == type(uint).max) {
            amount = origBalance;
            newBalance = 0;
        } else {
            require(origBalance >= amount, "e/insufficient-balance");
            unchecked { newBalance = origBalance - amount; }
        }

        assetStorage.users[account].balance = encodeAmount(newBalance);
        assetStorage.reserveBalance = assetCache.reserveBalance = encodeSmallAmount(assetCache.reserveBalance + amount);

        emit Withdraw(assetCache.underlying, account, amount);
        emitViaProxy_Transfer(proxyAddr, account, address(0), amount);

        logAssetStatus(assetCache);
    }
}
