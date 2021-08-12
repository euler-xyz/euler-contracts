// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";
import "./Utils.sol";

/// @notice Protected Tokens are simple wrappers for tokens, allowing you to use tokens as collateral without permitting borrowing
contract PToken {
    address private immutable euler;
    address public immutable underlying;

    constructor(address euler_, address underlying_) {
        euler = euler_;
        underlying = underlying_;
    }


    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;
    uint public totalSupply;


    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);


    function name() external view returns (string memory) {
        return string(abi.encodePacked("Euler Protected ", IERC20(underlying).name()));
    }

    function symbol() external view returns (string memory) {
        return string(abi.encodePacked("p", IERC20(underlying).symbol()));
    }

    function decimals() external view returns (uint8) {
        return IERC20(underlying).decimals();
    }


    function transfer(address recipient, uint amount) external returns (bool) {
        return transferFrom(msg.sender, recipient, amount);
    }

    function transferFrom(address from, address recipient, uint amount) public returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");
        if (from != msg.sender && msg.sender != euler && allowance[from][msg.sender] != type(uint).max) {
            require(allowance[from][msg.sender] >= amount, "insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(from, recipient, amount);
        return true;
    }

    function approve(address spender, uint amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }



    /// @notice Convert underlying tokens to pTokens
    /// @param amount In underlying units (which are equivalent to pToken units)
    function wrap(uint amount) external {
        totalSupply += amount;
        balanceOf[msg.sender] += amount;

        Utils.safeTransferFrom(underlying, msg.sender, address(this), amount);
        emit Transfer(address(0), msg.sender, amount);
    }

    /// @notice Convert pTokens to underlying tokens
    /// @param amount In pToken units (which are equivalent to underlying units)
    function unwrap(uint amount) external {
        doUnwrap(msg.sender, amount);
    }

    function doUnwrap(address who, uint amount) private {
        require(balanceOf[who] >= amount, "insufficient balance");

        totalSupply -= amount;
        balanceOf[who] -= amount;

        Utils.safeTransfer(underlying, who, amount);
        emit Transfer(who, address(0), amount);
    }


    // Internal methods only callable by the euler contract:

    function internalMint(address who, uint amount) external {
        require(msg.sender == euler, "permission denied");
        totalSupply += amount;
        balanceOf[who] += amount;
    }

    function internalUnwrap(address who, uint amount) external {
        require(msg.sender == euler, "permission denied");
        doUnwrap(who, amount);
    }
}
