// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../Interfaces.sol";
import "../PTokenVault.sol";
import "../Utils.sol";


// FIXME: must make methods nonReentrant

/// @notice Protected Tokens are simple wrappers for tokens, allowing you to use tokens as collateral without permitting borrowing
contract PToken is BaseLogic {
    constructor() BaseLogic(MODULEID__PTOKEN) {}

    function CALLER() private view returns (address underlying, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        underlying = pTokenLookup[proxyAddr];
        require(underlying != address(0), "e/unrecognized-ptoken-caller");
    }


    // Events

    event Transfer(address indexed from, address indexed to, uint value);


    // External methods

    function name() external view returns (string memory) {
        (address underlying,,) = CALLER();
        return string(abi.encodePacked("Euler Protected ", IERC20(underlying).name()));
    }

    function symbol() external view returns (string memory) {
        (address underlying,,) = CALLER();
        return string(abi.encodePacked("p", IERC20(underlying).symbol()));
    }

    function decimals() external view returns (uint8) {
        (address underlying,,) = CALLER();
        return IERC20(underlying).decimals();
    }


    function balanceOf(address account) external view returns (uint) {
        (address underlying,,) = CALLER();
        return pTokenBalance[underlying][account];
    }

    function totalSupply() external view returns (uint) {
        (address underlying,,) = CALLER();
        return pTokenTotalSupply[underlying];
    }


    function transfer(address to, uint amount) external returns (bool) {
        return transferFrom(address(0), to, amount);
    }

    function transferFrom(address from, address to, uint amount) public returns (bool) {
        (address underlying, address proxyAddr, address msgSender) = CALLER();

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        require(pTokenBalance[underlying][from] >= amount, "insufficient balance");
        require(isSubAccountOf(from, msgSender) || msgSender == address(this), "insufficient allowance");

        pTokenBalance[underlying][from] -= amount;
        pTokenBalance[underlying][to] += amount;

        emitViaProxy_Transfer(proxyAddr, from, to, amount);
        return true;
    }



    /// @notice Convert underlying tokens to pTokens
    /// @param amount In underlying units (which are equivalent to pToken units)
    function wrap(uint amount) external {
        (address underlying, address proxyAddr, address msgSender) = CALLER();

        pTokenTotalSupply[underlying] += amount;
        pTokenBalance[underlying][msgSender] += amount;

        Utils.safeTransferFrom(underlying, msgSender, pTokenVault, amount);
        emitViaProxy_Transfer(proxyAddr, address(0), msgSender, amount);
    }

    /// @notice Convert pTokens to underlying tokens
    /// @param amount In pToken units (which are equivalent to underlying units)
    function unwrap(uint amount) external {
        (address underlying, address proxyAddr, address msgSender) = CALLER();

        require(pTokenBalance[underlying][msgSender] >= amount, "insufficient balance");

        pTokenTotalSupply[underlying] -= amount;
        pTokenBalance[underlying][msgSender] -= amount;

        PTokenVault(pTokenVault).transferTokens(underlying, msgSender, amount);
        emitViaProxy_Transfer(proxyAddr, msgSender, address(0), amount);
    }
}
