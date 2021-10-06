pragma solidity ^0.8.0;

import "../munged/modules/EToken.sol";
import "../munged/modules/DToken.sol";
import "../munged/modules/Markets.sol";

// TODO as needed: import and extend other public interfaces
contract Harness is EToken, DToken, Markets {


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
        return isDToken
            ? DToken.name()
            : EToken.name();
    }

    function symbol()
        virtual override (EToken, DToken)
        public view returns (string memory)
    {
        return isDToken
            ? DToken.symbol()
            : EToken.symbol();
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

}


