pragma solidity ^0.8.0;

import "../munged/modules/EToken.sol";
import "../munged/modules/DToken.sol";
import "../munged/modules/Markets.sol";

// TODO as needed: import and extend other public interfaces
contract Harness is EToken, DToken, Markets {

    // This implementation chooses an arbitrary eToken and returns the
    // corresponding state.  The message sender is taken to be msg.sender
    address eTokenAddr;
    function CALLER()
        virtual
        override(EToken,DToken)
        internal view
        returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender)
    {
        require(eTokenAddr != address(0), "e/unrecognized-dtoken-caller");
        msgSender    = msg.sender;
        proxyAddr    = eTokenAddr;
        assetStorage = eTokenLookup[proxyAddr];
        underlying   = assetStorage.underlying;
        require(underlying != address(0), "e/unrecognized-etoken-caller");
    }

    // Since allowance is provided by both DToken and EToken, we override it
    // with a stub, and provide eTokenAllowance and dTokenAllowance methods to
    // ensure that these methods are verified
    //
    // Since allowance is external, we do not need to be concerned about
    // internal calls to allowance being overridden
    function allowance(address holder, address spender)
        virtual
        override(EToken,DToken)
        external view returns (uint)
    {
        return 0;
    }

    function dTokenAllowance(address holder, address spender)
        external view returns (uint)
    {
        return DToken.allowance(holder,spender);
    }

    function eTokenAllowance(address holder, address spender)
        external view returns (uint)
    {
        return EToken.allowance(holder,spender);
    }

    // Since approve is provided by both DToken and EToken, we override it
    // with a stub, and provide eTokenApprove and dTokenApprove methods to
    // ensure that these methods are verified
    //
    // Since approve is external, we do not need to be concerned about
    // internal calls to allowance being overridden
    function approve(address spender, uint amount)
        virtual
        override(EToken,DToken)
        external returns (bool)
    {
        return false;
    }

    function dTokenApprove(address spender, uint amount)
        external returns(bool)
    {
        return DToken.approve(spender, amount);
    }

    function eTokenApprove(address spender, uint amount)
        external returns(bool)
    {
        return EToken.approve(spender, amount);
    }

}


