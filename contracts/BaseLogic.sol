// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./BaseModule.sol";
import "./Interfaces.sol";
import "./vendor/RPow.sol";


abstract contract BaseLogic is BaseModule {
    constructor(uint moduleId_) BaseModule(moduleId_) {}


    // Account auth

    function getSubAccount(address primary, uint subAccountId) internal pure returns (address) {
        require(subAccountId < 256, "e/sub-account-id-too-big");
        return address(uint160(primary) ^ uint160(subAccountId));
    }

    function isSubAccountOf(address primary, address subAccount) internal pure returns (bool) {
        return (uint160(primary) | 0xFF) == (uint160(subAccount) | 0xFF);
    }


    // Entered market array

    function getEnteredMarketsArray(address account) internal view returns (address[] memory) {
        uint32 numMarketsEntered = accountLookup[account].numMarketsEntered;
        address firstMarketEntered = accountLookup[account].firstMarketEntered;
        address[MAX_POSSIBLE_ENTERED_MARKETS] storage markets = marketsEntered[account];

        address[] memory output = new address[](numMarketsEntered);
        if (numMarketsEntered == 0) return output;

        output[0] = firstMarketEntered;

        for (uint i = 1; i < numMarketsEntered; i++) {
            output[i] = markets[i];
        }

        return output;
    }

    function getEnteredMarket(address account, address[MAX_POSSIBLE_ENTERED_MARKETS] storage markets, uint i) private view returns (address) {
        if (i == 0) return accountLookup[account].firstMarketEntered;
        else return markets[i];
    }

    function setEnteredMarket(address account, address[MAX_POSSIBLE_ENTERED_MARKETS] storage markets, uint i, address underlying) private {
        if (i == 0) accountLookup[account].firstMarketEntered = underlying;
        else markets[i] = underlying;
    }

    function doEnterMarket(address account, address underlying) internal {
        uint32 numMarketsEntered = accountLookup[account].numMarketsEntered;
        address[MAX_POSSIBLE_ENTERED_MARKETS] storage markets = marketsEntered[account];

        for (uint i = 0; i < numMarketsEntered; i++) {
            if (getEnteredMarket(account, markets, i) == underlying) return; // already entered
        }

        require(numMarketsEntered < MAX_ENTERED_MARKETS, "e/too-many-entered-markets");

        setEnteredMarket(account, markets, numMarketsEntered, underlying);
        accountLookup[account].numMarketsEntered++;
    }

    // Liquidity check must be done by caller after calling this

    function doExitMarket(address account, address underlying) internal {
        uint32 numMarketsEntered = accountLookup[account].numMarketsEntered;
        address[MAX_POSSIBLE_ENTERED_MARKETS] storage markets = marketsEntered[account];
        uint searchIndex = type(uint).max;

        for (uint i = 0; i < numMarketsEntered; i++) {
            if (getEnteredMarket(account, markets, i) == underlying) {
                searchIndex = i;
                break;
            }
        }

        if (searchIndex == type(uint).max) return; // already exited

        uint lastMarketIndex = numMarketsEntered - 1;
        if (searchIndex != lastMarketIndex) setEnteredMarket(account, markets, searchIndex, getEnteredMarket(account, markets, lastMarketIndex));
        accountLookup[account].numMarketsEntered--;

        if (lastMarketIndex != 0) setEnteredMarket(account, markets, lastMarketIndex, address(0)); // FIXME: Zero out for the refund, or leave it set under assumption we'll enter another one soon?
    }


    // AssetCache

    struct AssetCache {
        address underlying;

        uint112 totalBalances;
        uint112 totalBorrows;

        uint interestAccumulator;

        uint40 lastInterestAccumulatorUpdate;
        uint8 underlyingDecimals;
        uint32 interestRateModel;
        int96 interestRate;
        uint32 prevUtilisation;
        uint16 pricingType;
        uint32 pricingParameters;

        uint poolSize; // result of calling balanceOf on underlying (in external units)

        uint underlyingDecimalsScaler;
    }

    function loadAssetCache(address underlying, AssetStorage storage assetStorage) internal view returns (AssetCache memory assetCache) {
        assetCache.underlying = underlying;

        // Storage loads

        assetCache.lastInterestAccumulatorUpdate = assetStorage.lastInterestAccumulatorUpdate;
        uint8 underlyingDecimals = assetCache.underlyingDecimals = assetStorage.underlyingDecimals;
        assetCache.interestRateModel = assetStorage.interestRateModel;
        assetCache.interestRate = assetStorage.interestRate;
        assetCache.prevUtilisation = assetStorage.prevUtilisation;
        assetCache.pricingType = assetStorage.pricingType;
        assetCache.pricingParameters = assetStorage.pricingParameters;

        assetCache.totalBalances = assetStorage.totalBalances;
        assetCache.totalBorrows = assetStorage.totalBorrows;

        assetCache.interestAccumulator = assetStorage.interestAccumulator;

        // Extra computation

        assetCache.underlyingDecimalsScaler = 10**(18 - underlyingDecimals);
        assetCache.poolSize = callBalanceOf(assetCache, address(this)); // Must be done after decimalScaler set
    }

    function callBalanceOf(AssetCache memory assetCache, address account) internal view FREEMEM returns (uint) {
        // We set a gas limit so that a malicious token can't eat up all gas and cause a liquidity check to fail.

        // FIXME: What if user sends just right amount of gas to cause a balanceOf from an honest token to incorrectly return 0?
        //   - probably OK, since there will be too little gas to do anything afterwards
        //   - but maybe we should require gas left is > 20000 at this point?
        //   read this again -> https://ronan.eth.link/blog/ethereum-gas-dangers/

        (bool success, bytes memory data) = assetCache.underlying.staticcall{gas: 20000}(abi.encodeWithSelector(IERC20.balanceOf.selector, account));

        // If token's balanceOf() call fails for any reason, return 0. This prevents malicious tokens from causing liquidity checks to fail.
        // If the contract doesn't exist (maybe because selfdestructed), then data.length will be 0 and we will return 0.
        // Data length > 32 is allowed because some legitimate tokens append extra data that can be safely ignored.

        if (!success || data.length < 32) return 0;

        (uint balance) = abi.decode(data, (uint256));

        // If token returns an amount that is too large, return 0 instead. This prevents malicious tokens from causing
        // liquidity checks to fail by increasing balances to insanely large amounts.

        if (balance > MAX_SANE_TOKEN_AMOUNT) return 0;
        balance *= assetCache.underlyingDecimalsScaler;

        if (balance > MAX_SANE_TOKEN_AMOUNT) return 0;
        return balance;
    }

    function encodeAmount(uint amount) internal pure returns (uint112) {
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/insane-amount");
        return uint112(amount);
    }

    function computeExchangeRate(AssetCache memory assetCache) internal view returns (uint) {
        if (assetCache.totalBalances == 0) return 1e18;
        (uint currentTotalBorrows,) = getCurrentTotalBorrows(assetCache);
        return (assetCache.poolSize + (currentTotalBorrows / INTERNAL_DEBT_PRECISION)) * 1e18 / assetCache.totalBalances;
    }

    function balanceFromUnderlyingAmount(AssetCache memory assetCache, uint amount) internal view returns (uint) {
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded"); // FIXME: should we do this here or at higher levels?
        uint exchangeRate = computeExchangeRate(assetCache);
        return amount * 1e18 / exchangeRate;
    }

    function balanceToUnderlyingAmount(AssetCache memory assetCache, uint amount) internal view returns (uint) {
        uint exchangeRate = computeExchangeRate(assetCache);
        return amount * exchangeRate / 1e18;
    }

    function computeUpdatedInterestAccumulator(AssetCache memory assetCache) internal view returns (uint) {
        uint lastInterestAccumulator = assetCache.interestAccumulator;
        if (lastInterestAccumulator == 0) return INITIAL_INTEREST_ACCUMULATOR;
        uint deltaT = block.timestamp - assetCache.lastInterestAccumulatorUpdate;
        if (deltaT == 0) return lastInterestAccumulator;
        return (RPow.rpow(uint(int(assetCache.interestRate) + 1e27), deltaT, 1e27) * lastInterestAccumulator) / 1e27;
    }



    // Balances

    function increaseBalance(AssetStorage storage assetStorage, AssetCache memory assetCache, address account, uint amount) internal {
        assetStorage.users[account].balance = encodeAmount(assetStorage.users[account].balance + amount);

        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(uint(assetCache.totalBalances) + amount);

        updateInterestAccumulator(assetStorage, assetCache);
        updateInterestRate(assetCache);
        flushPackedSlot(assetStorage, assetCache);
    }

    function decreaseBalance(AssetStorage storage assetStorage, AssetCache memory assetCache, address account, uint amount) internal {
        uint origBalance = assetStorage.users[account].balance;
        require(origBalance >= amount, "e/insufficient-balance");
        assetStorage.users[account].balance = encodeAmount(origBalance - amount);

        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        updateInterestAccumulator(assetStorage, assetCache);
        updateInterestRate(assetCache);
        flushPackedSlot(assetStorage, assetCache);
    }

    function transferBalance(AssetStorage storage assetStorage, address from, address to, uint amount) internal {
        uint origFromBalance = assetStorage.users[from].balance;
        require(origFromBalance >= amount, "e/insufficient-balance");
        uint newFromBalance;
        unchecked { newFromBalance = origFromBalance - amount; }

        assetStorage.users[from].balance = encodeAmount(origFromBalance - amount);
        assetStorage.users[to].balance = encodeAmount(assetStorage.users[to].balance + amount);
    }




    // Borrows

    // Returns internal precision

    function getCurrentTotalBorrows(AssetCache memory assetCache) internal view returns (uint currentTotalBorrows, uint currentInterestAccumulator) {
        currentInterestAccumulator = computeUpdatedInterestAccumulator(assetCache);

        uint origInterestAccumulator = assetCache.interestAccumulator;
        if (origInterestAccumulator == 0) origInterestAccumulator = currentInterestAccumulator;

        currentTotalBorrows = assetCache.totalBorrows * currentInterestAccumulator / origInterestAccumulator;
    }

    // Returns internal precision

    function getCurrentOwedExact(AssetStorage storage assetStorage, uint currentInterestAccumulator, address account) internal view returns (uint) {
        uint owed = assetStorage.users[account].owed;

        // Avoid loading the accumulator
        if (owed == 0) return 0;

        // Can't divide by 0 here: If owed is non-zero, we must've initialised the interestAccumulator
        return owed * currentInterestAccumulator / assetStorage.users[account].interestAccumulator;
    }

    // When non-zero, we round *up* to the smallest external unit so that outstanding dust in a loan can be repaid.

    function roundUpOwed(AssetCache memory assetCache, uint owed) internal pure returns (uint) {
        if (owed == 0) return 0;
        uint scale = INTERNAL_DEBT_PRECISION * assetCache.underlyingDecimalsScaler;
        return (owed + scale) / scale * scale;
    }

    // Returns internal precision

    function getCurrentOwed(AssetStorage storage assetStorage, AssetCache memory assetCache, address account) internal view returns (uint) {
        return roundUpOwed(assetCache, getCurrentOwedExact(assetStorage, computeUpdatedInterestAccumulator(assetCache), account));
    }


    // Only writes out the values that can be changed in this file

    function flushPackedSlot(AssetStorage storage assetStorage, AssetCache memory assetCache) internal {
        assetStorage.lastInterestAccumulatorUpdate = assetCache.lastInterestAccumulatorUpdate;
        assetStorage.interestRate = assetCache.interestRate;
        assetStorage.prevUtilisation = assetCache.prevUtilisation;
    }

    // Must call flushPackedSlot after calling this function

    function updateInterestAccumulator(AssetStorage storage assetStorage, AssetCache memory assetCache) internal {
        if (block.timestamp == assetCache.lastInterestAccumulatorUpdate) return;

        uint currentInterestAccumulator = computeUpdatedInterestAccumulator(assetCache);

        uint origInterestAccumulator = assetCache.interestAccumulator;
        if (origInterestAccumulator == 0) origInterestAccumulator = currentInterestAccumulator;

        assetStorage.interestAccumulator = assetCache.interestAccumulator = currentInterestAccumulator;
        assetStorage.totalBorrows = assetCache.totalBorrows = encodeAmount(assetCache.totalBorrows * currentInterestAccumulator / origInterestAccumulator);

        // Updates to packed slot, must be flushed after:
        assetCache.lastInterestAccumulatorUpdate = uint40(block.timestamp);
    }

    // Must call updateInterestAccumulator before calling this function
    // Must call flushPackedSlot after calling this function

    function updateInterestRate(AssetCache memory assetCache) internal {
        uint32 newUtilisation;

        {
            uint totalBorrows = assetCache.totalBorrows / INTERNAL_DEBT_PRECISION;
            uint total = assetCache.poolSize + totalBorrows;
            if (total == 0) newUtilisation = 0; // empty pool arbitrarily given utilisation of 0
            else newUtilisation = uint32(totalBorrows * (uint(type(uint32).max) * 1e18) / total / 1e18);
        }

        bytes memory result = callInternalModule(assetCache.interestRateModel,
                                                 abi.encodeWithSelector(IIRM.computeInterestRate.selector, assetCache.underlying, newUtilisation, assetCache.prevUtilisation, assetCache.interestRate, block.timestamp - assetCache.lastInterestAccumulatorUpdate));

        (int96 newInterestRate) = abi.decode(result, (int96));

        // Updates to packed slot, must be flushed after:
        assetCache.interestRate = newInterestRate;
        assetCache.prevUtilisation = newUtilisation;
    }

    // Must call updateInterestAccumulator before calling this function

    function updateUserBorrow(AssetStorage storage assetStorage, AssetCache memory assetCache, address account) internal returns (uint newOwedExact) {
        uint currentInterestAccumulator = assetCache.interestAccumulator;

        newOwedExact = getCurrentOwedExact(assetStorage, currentInterestAccumulator, account);

        assetStorage.users[account].owed = encodeAmount(newOwedExact); // FIXME: redundant storage write in increase/decreaseBorrow: this owed is updated right after too
        assetStorage.users[account].interestAccumulator = currentInterestAccumulator;
    }



    function increaseBorrow(AssetStorage storage assetStorage, AssetCache memory assetCache, address account, uint amount) internal {
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");
        amount *= INTERNAL_DEBT_PRECISION;

        updateInterestAccumulator(assetStorage, assetCache);

        uint owed = updateUserBorrow(assetStorage, assetCache, account);

        if (owed == 0) doEnterMarket(account, assetCache.underlying);

        owed += amount;

        assetStorage.users[account].owed = encodeAmount(owed);
        assetStorage.totalBorrows = assetCache.totalBorrows = encodeAmount(assetCache.totalBorrows + amount);

        updateInterestRate(assetCache);
        flushPackedSlot(assetStorage, assetCache);
    }

    function decreaseBorrow(AssetStorage storage assetStorage, AssetCache memory assetCache, address account, uint amount) internal {
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");
        amount *= INTERNAL_DEBT_PRECISION;

        updateInterestAccumulator(assetStorage, assetCache);

        uint owedExact = updateUserBorrow(assetStorage, assetCache, account);
        uint owedRoundedUp = roundUpOwed(assetCache, owedExact);

        require(amount <= owedRoundedUp, "e/repay-too-much");
        uint owedRemaining;
        unchecked { owedRemaining = owedRoundedUp - amount; }

        if (owedExact > assetCache.totalBorrows) owedExact = assetCache.totalBorrows;

        if (owedRemaining < INTERNAL_DEBT_PRECISION) owedRemaining = 0;

        assetStorage.users[account].owed = encodeAmount(owedRemaining);
        assetStorage.totalBorrows = assetCache.totalBorrows = encodeAmount(assetCache.totalBorrows - owedExact + owedRemaining);

        updateInterestRate(assetCache);
        flushPackedSlot(assetStorage, assetCache);
    }

    function transferBorrow(AssetStorage storage assetStorage, AssetCache memory assetCache, address from, address to, uint amount) internal {
        require(amount <= MAX_SANE_TOKEN_AMOUNT, "e/max-sane-tokens-exceeded");
        amount *= INTERNAL_DEBT_PRECISION;

        updateInterestAccumulator(assetStorage, assetCache);
        flushPackedSlot(assetStorage, assetCache);

        uint origFromBorrow = updateUserBorrow(assetStorage, assetCache, from);
        uint origToBorrow = updateUserBorrow(assetStorage, assetCache, to);

        if (origToBorrow == 0) doEnterMarket(to, assetCache.underlying);

        require(origFromBorrow >= amount, "e/insufficient-balance");
        uint newFromBorrow;
        unchecked { newFromBorrow = origFromBorrow - amount; }

        if (newFromBorrow < INTERNAL_DEBT_PRECISION) {
            // Dust is transferred too
            amount += newFromBorrow;
            newFromBorrow = 0;
        }

        assetStorage.users[from].owed = encodeAmount(newFromBorrow);
        assetStorage.users[to].owed = encodeAmount(origToBorrow + amount);
    }




    // Token asset transfers

    function safeTransferFrom(address token, address from, address to, uint value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), string(data));
    }

    function safeTransfer(address token, address to, uint value) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), string(data));
    }

    // amounts are in underlying units

    function pullTokens(AssetCache memory assetCache, address from, uint amount) internal returns (uint amountTransferred) {
        uint poolSizeBefore = assetCache.poolSize;

        safeTransferFrom(assetCache.underlying, from, address(this), amount / assetCache.underlyingDecimalsScaler);
        uint poolSizeAfter = assetCache.poolSize = callBalanceOf(assetCache, address(this));

        require(poolSizeAfter >= poolSizeBefore, "e/negative-transfer-amount");
        unchecked { amountTransferred = poolSizeAfter - poolSizeBefore; }
    }

    function pushTokens(AssetCache memory assetCache, address to, uint amount) internal returns (uint amountTransferred) {
        uint poolSizeBefore = assetCache.poolSize;

        safeTransfer(assetCache.underlying, to, amount / assetCache.underlyingDecimalsScaler);
        uint poolSizeAfter = assetCache.poolSize = callBalanceOf(assetCache, address(this));

        require(poolSizeBefore >= poolSizeAfter, "e/negative-transfer-amount");
        unchecked { amountTransferred = poolSizeBefore - poolSizeAfter; }
    }




    // Liquidity

    function checkLiquidity(address account) internal {
        if (accountLookup[account].liquidityCheckInProgress) return;

        callInternalModule(MODULEID__RISK_MANAGER, abi.encodeWithSelector(IRiskManager.requireLiquidity.selector, account));
    }
}
