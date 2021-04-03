// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


contract EToken is BaseLogic {
    constructor() BaseLogic(MODULEID__ETOKEN) {}

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

    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Pool: ", IERC20(underlying).name()));
    }

    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("e", IERC20(underlying).symbol()));
    }

    uint8 public constant decimals = 18;



    function totalSupply() external view returns (uint) {
        (,AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.totalBalances;
    }

    function totalSupplyUnderlying() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, assetCache.totalBalances);
    }


    function balanceOf(address account) external view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.users[account].balance;
    }

    function balanceOfUnderlying(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        return balanceToUnderlyingAmount(assetCache, assetStorage.users[account].balance) / assetCache.underlyingDecimalsScaler;
    }



    function deposit(uint subAccountId, uint amount) external nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) {
            amount = callBalanceOf(assetCache, msgSender);
        } else {
            amount *= assetCache.underlyingDecimalsScaler;
        }

        uint amountTransferred = pullTokens(assetCache, msgSender, amount);
        uint amountInternal;

        // pullTokens() updates poolSize in the cache, but we need the poolSize before the deposit to determine
        // the internal amount so temporarily reduce it by the amountTransferred (which is size checked within
        // pullTokens(). We can't compute this value before the pull because we don't know how much we'll
        // actually receive (the token might be deflationary).

        unchecked {
            assetCache.poolSize -= amountTransferred;
            amountInternal = balanceFromUnderlyingAmount(assetCache, amountTransferred);
            assetCache.poolSize += amountTransferred;
        }

        increaseBalance(assetStorage, assetCache, account, amountInternal);

        emit Deposit(underlying, account, amountTransferred);
        emitViaProxy_Transfer(proxyAddr, address(0), account, amountInternal);

        return true;
    }


    function withdraw(uint subAccountId, uint amount) external nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint amountInternal;

        if (amount == type(uint).max) {
            amountInternal = assetStorage.users[account].balance;
            amount = balanceToUnderlyingAmount(assetCache, amountInternal);
        } else {
            amount *= assetCache.underlyingDecimalsScaler;
            amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
        }

        require(assetCache.poolSize >= amount, "e/insufficient-pool-size");
        pushTokens(assetCache, msgSender, amount);

        decreaseBalance(assetStorage, assetCache, account, amountInternal);

        emit Withdraw(underlying, account, amount);
        emitViaProxy_Transfer(proxyAddr, account, address(0), amountInternal);

        checkLiquidity(account);

        return true;
    }



    function approve(address spender, uint amount) external reentrantOK returns (bool) {
        return approveSubAccount(0, spender, amount);
    }

    function approveSubAccount(uint subAccountId, address spender, uint amount) public reentrantOK returns (bool) {
        (, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        require(!isSubAccountOf(spender, account), "e/self-approval");

        assetStorage.eTokenAllowance[account][spender] = amount;
        emitViaProxy_Approval(proxyAddr, account, spender, amount);

        return true;
    }

    function allowance(address holder, address spender) external view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.eTokenAllowance[holder][spender];
    }




    function transfer(address to, uint amount) external returns (bool) {
        return transferFrom(address(0), to, amount);
    }

    function transferFrom(address from, address to, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        if (amount == type(uint).max) {
            amount = assetStorage.users[from].balance;
        }

        if (!isSubAccountOf(msgSender, from) && assetStorage.eTokenAllowance[from][msgSender] != type(uint).max) {
            require(assetStorage.eTokenAllowance[from][msgSender] >= amount, "e/insufficient-allowance");
            unchecked { assetStorage.eTokenAllowance[from][msgSender] -= amount; }
        }

        transferBalance(assetStorage, from, to, amount);

        uint amountTransferred = balanceToUnderlyingAmount(assetCache, amount);

        emit Withdraw(underlying, from, amountTransferred);
        emit Deposit(underlying, to, amountTransferred);
        emitViaProxy_Transfer(proxyAddr, from, to, amount);

        checkLiquidity(from);

        return true;
    }
}
