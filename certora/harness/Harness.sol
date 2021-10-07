pragma solidity ^0.8.0;

import "../munged/modules/EToken.sol";
import "../munged/modules/DToken.sol";
import "../munged/modules/Markets.sol";

// TODO as needed: import and extend other public interfaces
contract Harness is EToken, DToken, Markets {

    uint arbitraryUint;

    ////////////////////////////////////////////////////////////////////////////
    // Overridden methods //////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // This ensures that the msg sender is treated properly, and the proxyAddr
    // is chosen arbitrarily.
    address arbitraryAddress;
    function unpackTrailingParams()
        virtual override
        internal view returns (address msgSender, address proxyAddr)
    {
        return (msg.sender, arbitraryAddress);
    }

    // This makes internal module calls seem pure and nondeterministic
    // THIS IS UNSAFE!  If a module calls another non-pure internal method,
    // those side effects will be missed by CVT.
    bytes arbitraryResult;
    function callInternalModule(uint moduleId, bytes memory input)
        virtual override
        internal returns (bytes memory)
    {
        return arbitraryResult;
    }

    // The math in accrueInterest is too expensive to analyze, so we skip it
    // TODO: we probably want a harness with this and without this so that we
    // can explicitly check accrueInterest
    function accrueInterest(AssetCache memory assetCache)
        virtual override
        internal view
    { 
    }

    // callBalanceOf uses a gas limit, and the staticcall seems to be tripping
    // CVT up, so we replace it with a normal call.
    function callBalanceOf(AssetCache memory assetCache, address account)
        virtual override
        internal view returns (uint)
    {
        return IERC20(account).balanceOf(account);
    }

    // TODO: pool size computations are looking like infinite recursion to CVT
    function computeDerivedState(AssetCache memory assetCache) override virtual view internal {
        unchecked {
            assetCache.underlyingDecimalsScaler = 10**(18 - assetCache.underlyingDecimals);
            assetCache.maxExternalAmount = MAX_SANE_AMOUNT / assetCache.underlyingDecimalsScaler;
        }

        // uint poolSize = callBalanceOf(assetCache, address(this));
        // if (poolSize <= assetCache.maxExternalAmount) {
        //     unchecked { assetCache.poolSize = poolSize * assetCache.underlyingDecimalsScaler; }
        // } else {
        //     assetCache.poolSize = 0;
        // }
    }

    // We're not testing the average liquidity, and this method was causing
    // timeouts.
    function getUpdatedAverageLiquidity(address account) virtual override internal returns (uint)
    {
        return arbitraryUint;
    }

    ////////////////////////////////////////////////////////////////////////////
    // Dispatcher methods for EToken/DToken ////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // CVT will give this an arbitrary value; we use this to dispatch to the
    // correct implementation of methods that are defined in both EToken and
    // DToken
    bool isDToken;
    // This is similar to a DISPATCHER method summary, but is necessary to do
    // here because solidity forces you to override methods defined in multiple
    // base contracts

    function CALLER()
        virtual
        override(EToken, DToken)
        internal view
        returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender)
    {
        return isDToken
            ? DToken.CALLER()
            : EToken.CALLER();
    }

    function allowance(address holder, address spender)
        virtual
        override(EToken, DToken)
        public view returns (uint)
    {
        return isDToken
            ? DToken.allowance(holder, spender)
            : EToken.allowance(holder, spender);
    }

    function approve(address spender, uint amount)
        virtual
        override(EToken, DToken)
        public returns (bool)
    {
        return isDToken
            ? DToken.approve(spender, amount)
            : EToken.approve(spender, amount);
    }

    function approveSubAccount(uint subAccountId, address spender, uint amount)
        virtual
        override(EToken, DToken)
        public returns (bool)
    {
        return isDToken
            ? DToken.approveSubAccount(subAccountId, spender, amount)
            : EToken.approveSubAccount(subAccountId, spender, amount);
    }

    function balanceOf(address account)
        virtual
        override(EToken, DToken)
        public view returns (uint)
    {
        return isDToken
            ? DToken.balanceOf(account)
            : EToken.balanceOf(account);
    }

    function decimals()
        virtual
        override(EToken, DToken)
        public view returns (uint8)
    {
        return isDToken
            ? DToken.decimals()
            : EToken.decimals();
    }

    function name()
        virtual override (EToken, DToken)
        public view returns (string memory)
    {
        return "";
        // return isDToken
        //     ? DToken.name()
        //     : EToken.name();
    }

    function symbol()
        virtual override (EToken, DToken)
        public view returns (string memory)
    {
        return "";
        // return isDToken
        //     ? DToken.symbol()
        //     : EToken.symbol();
    }

    function totalSupply()
        virtual override (EToken, DToken)
        public view returns (uint)
    {
        return isDToken
            ? DToken.totalSupply()
            : EToken.totalSupply();
    }

    function transfer(address to, uint amount)
        virtual override (EToken, DToken)
        public returns (bool)
    {
        return isDToken
            ? DToken.transfer(to, amount)
            : EToken.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint amount)
        virtual override (EToken, DToken)
        public returns (bool)
    {
        return isDToken
            ? DToken.transferFrom(from, to, amount)
            : EToken.transferFrom(from, to, amount);
    }

    ////////////////////////////////////////////////////////////////////////////
    // Accessors to help CVT ///////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // These are workarounds to the lack of struct support in CVL
    // There should be one accessor for each field of AssetStorage
    // Note: et_ stands for eTokenLookup[address]
    function et_lastInterestAccumulatorUpdate (address eToken) public view returns (uint40)  { return eTokenLookup[eToken].lastInterestAccumulatorUpdate ; }
    function et_underlyingDecimals            (address eToken) public view returns (uint8)   { return eTokenLookup[eToken].underlyingDecimals            ; }
    function et_interestRateModel             (address eToken) public view returns (uint32)  { return eTokenLookup[eToken].interestRateModel             ; }
    function et_interestRate                  (address eToken) public view returns (uint96)  { return eTokenLookup[eToken].interestRate                  ; }
    function et_reserveFee                    (address eToken) public view returns (uint32)  { return eTokenLookup[eToken].reserveFee                    ; }
    function et_pricingType                   (address eToken) public view returns (uint16)  { return eTokenLookup[eToken].pricingType                   ; }
    function et_pricingParameters             (address eToken) public view returns (uint32)  { return eTokenLookup[eToken].pricingParameters             ; }
    function et_underlying                    (address eToken) public view returns (address) { return eTokenLookup[eToken].underlying                    ; }
    function et_reserveBalance                (address eToken) public view returns (uint96)  { return eTokenLookup[eToken].reserveBalance                ; }
    function et_dTokenAddress                 (address eToken) public view returns (address) { return eTokenLookup[eToken].dTokenAddress                 ; }
    function et_totalBalances                 (address eToken) public view returns (uint112) { return eTokenLookup[eToken].totalBalances                 ; }
    function et_totalBorrows                  (address eToken) public view returns (uint144) { return eTokenLookup[eToken].totalBorrows                  ; }
    function et_interestAccumulator           (address eToken) public view returns (uint)    { return eTokenLookup[eToken].interestAccumulator           ; }

    function et_user_balance             (address eToken, address user) public view returns (uint112) { return eTokenLookup[eToken].users[user].balance            ; }
    function et_user_owed                (address eToken, address user) public view returns (uint144) { return eTokenLookup[eToken].users[user].owed               ; }
    function et_user_interestAccumulator (address eToken, address user) public view returns (uint)    { return eTokenLookup[eToken].users[user].interestAccumulator; }
    function et_eTokenAllowance (address eToken, address a, address b)  public view returns (uint)    { return eTokenLookup[eToken].eTokenAllowance[a][b]          ; }
    function et_dTokenAllowance (address eToken, address a, address b)  public view returns (uint)    { return eTokenLookup[eToken].dTokenAllowance[a][b]          ; }

    function underlying_eTokenAddress         (address underlying) public view returns (address) { return underlyingLookup[underlying].eTokenAddress       ; }

    function ERCBalanceOf(address token, address user) public returns (uint) {
        return IERC20(token).balanceOf(user);
    }

    function ERCTransfer(address token, address to, uint value) public {
        IERC20(token).transfer(to, value);
    }

}


