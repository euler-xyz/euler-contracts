pragma solidity ^0.8.0;

import "../munged/modules/EToken.sol";
import "../munged/modules/DToken.sol";
import "../munged/modules/Markets.sol";

// TODO as needed: import and extend other public interfaces
contract Harness is EToken, DToken, Markets {

    // CVT will give this an arbitrary value; we use this to dispatch to the
    // correct implementation of methods that are defined in both EToken and
    // DToken
    bool isDToken;
    // This is similar to a DISPATCHER method summary, but is necessary to do
    // here because solidity forces you to override methods defined in multiple
    // base contracts

    function CALLER()
        virtual
        override(EToken,DToken)
        internal view
        returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender)
    {
        return isDToken
            ? DToken.CALLER()
            : EToken.CALLER();
    }

    function allowance(address holder, address spender)
        virtual
        override(EToken,DToken)
        external view returns (uint)
    {
        return isDToken
            ? DToken.allowance(holder, spender)
            : EToken.allowance(holder, spender);
    }

    function approve(address spender, uint amount)
        virtual
        override(EToken,DToken)
        external returns (bool)
    {
        return isDToken
            ? DToken.approve(spender, amount)
            : EToken.approve(spender, amount);
    }

    function approveSubAccount(uint subAccountId, address spender, uint amount)
        public returns (bool)
    {
        return isDToken
            ? DToken.approveSubAccount(subAccountId, spender, amount)
            : EToken.approveSubAccount(subAccountId, spender, amount);
    }
}


