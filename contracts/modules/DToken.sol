// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


contract DToken is BaseLogic {
    constructor() BaseLogic(MODULEID__DTOKEN) {}

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

    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Debt: ", IERC20(underlying).name()));
    }

    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("d", IERC20(underlying).symbol()));
    }

    uint8 public constant decimals = 18;



    function totalSupply() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        (uint totalBorrows,) = getCurrentTotalBorrows(assetCache);
        return totalBorrows / INTERNAL_DEBT_PRECISION;
    }

    function totalSupplyExact() external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        (uint totalBorrows,) = getCurrentTotalBorrows(assetCache);
        return totalBorrows;
    }

    function balanceOf(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        return getCurrentOwed(assetStorage, assetCache, account) / INTERNAL_DEBT_PRECISION / assetCache.underlyingDecimalsScaler;
    }

    function balanceOfExact(address account) external view returns (uint) {
        (address underlying, AssetStorage storage assetStorage,,) = CALLER();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        return getCurrentOwedExact(assetStorage, computeUpdatedInterestAccumulator(assetCache), account);
    }


    function borrow(uint subAccountId, uint amount) external nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) {
            amount = assetCache.poolSize;
        } else {
            amount *= assetCache.underlyingDecimalsScaler;
        }

        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");
        require(amount <= assetCache.poolSize, "e/insufficient-tokens-available");

        pushTokens(assetCache, msgSender, amount);

        increaseBorrow(assetStorage, assetCache, account, amount);

        emit Borrow(underlying, account, amount);
        emitViaProxy_Transfer(proxyAddr, address(0), account, amount);

        checkLiquidity(account);

        return true;
    }

    function repay(uint subAccountId, uint amount) external nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount != type(uint).max) {
            amount *= assetCache.underlyingDecimalsScaler;
        }

        uint owed = getCurrentOwed(assetStorage, assetCache, account) / INTERNAL_DEBT_PRECISION;
        if (amount > owed) amount = owed;
        if (owed == 0) return true;

        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");

        amount = pullTokens(assetCache, msgSender, amount);

        decreaseBorrow(assetStorage, assetCache, account, amount);

        emit Repay(underlying, account, amount);
        emitViaProxy_Transfer(proxyAddr, account, address(0), amount);

        return true;
    }



    function approve(address spender, uint amount) external reentrantOK returns (bool) {
        return approveSubAccount(0, spender, amount);
    }

    function approveSubAccount(uint subAccountId, address spender, uint amount) public reentrantOK returns (bool) {
        (, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        require(!isSubAccountOf(spender, account), "e/self-approval");

        assetStorage.dTokenAllowance[account][spender] = amount;
        emitViaProxy_Approval(proxyAddr, account, spender, amount);

        return true;
    }

    function allowance(address holder, address spender) external view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();

        return assetStorage.dTokenAllowance[holder][spender];
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
            amount = getCurrentOwed(assetStorage, assetCache, from) / INTERNAL_DEBT_PRECISION;
        } else {
            amount *= assetCache.underlyingDecimalsScaler;
        }

        if (!isSubAccountOf(msgSender, to) && assetStorage.dTokenAllowance[to][msgSender] != type(uint).max) {
            require(assetStorage.dTokenAllowance[to][msgSender] >= amount, "e/insufficient-allowance");
            unchecked { assetStorage.dTokenAllowance[to][msgSender] -= amount; }
        }

        transferBorrow(assetStorage, assetCache, from, to, amount);

        emit Repay(underlying, from, amount);
        emit Borrow(underlying, to, amount);
        emitViaProxy_Transfer(proxyAddr, from, to, amount);

        checkLiquidity(to);

        return true;
    }
}
