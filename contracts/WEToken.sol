// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./Interfaces.sol";
import "./Utils.sol";

interface IEuler {
    function moduleIdToProxy(uint moduleId) external view returns (address);
}

interface IMarkets {
    function underlyingToEToken(address underlying) external view returns (address);
}

/// @notice Protected Tokens are simple wrappers for tokens, allowing you to use tokens as collateral without permitting borrowing
contract WEToken {
    address immutable euler;
    address immutable eTokenAddr;

    constructor(address euler_, address eTokenAddr_) {
        euler = euler_;
        eTokenAddr = eTokenAddr_;
    }


    mapping(address => uint) balances;
    mapping(address => mapping(address => uint)) allowances;
    uint totalBalances;


    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);


    /// @notice PToken name, ie "Euler Protected DAI"
    function name() external view returns (string memory) {
        return string(abi.encodePacked("Wrapped ", IERC20(eTokenAddr).name()));
    }

    /// @notice PToken symbol, ie "weDAI"
    function symbol() external view returns (string memory) {
        return string(abi.encodePacked("w", IERC20(eTokenAddr).symbol()));
    }

    /// @notice Number of decimals, which is same as the underlying's
    function decimals() external view returns (uint8) {
        return IERC20(eTokenAddr).decimals();
    }

    /// @notice Address of the underlying asset
    function eToken() external view returns (address) {
        return eTokenAddr;
    }


    /// @notice Balance of an account's wrapped tokens
    function balanceOf(address who) external view returns (uint) {
        return balances[who];
    }

    /// @notice Sum of all wrapped token balances
    function totalSupply() external view returns (uint) {
        return totalBalances;
    }

    /// @notice Retrieve the current allowance
    /// @param holder Address giving permission to access tokens
    /// @param spender Trusted address
    function allowance(address holder, address spender) external view returns (uint) {
        return allowances[holder][spender];
    }


    /// @notice Transfer your own pTokens to another address
    /// @param recipient Recipient address
    /// @param amount Amount of wrapped token to transfer
    function transfer(address recipient, uint amount) external returns (bool) {
        return transferFrom(msg.sender, recipient, amount);
    }

    /// @notice Transfer pTokens from one address to another. The euler address is automatically granted approval.
    /// @param from This address must've approved the to address
    /// @param recipient Recipient address
    /// @param amount Amount to transfer
    function transferFrom(address from, address recipient, uint amount) public returns (bool) {
        require(balances[from] >= amount, "insufficient balance");
        if (from != msg.sender && msg.sender != euler && allowances[from][msg.sender] != type(uint).max) {
            require(allowances[from][msg.sender] >= amount, "insufficient allowance");
            allowances[from][msg.sender] -= amount;
            emit Approval(from, msg.sender, allowances[from][msg.sender]);
        }
        balances[from] -= amount;
        balances[recipient] += amount;
        emit Transfer(from, recipient, amount);
        return true;
    }

    /// @notice Allow spender to access an amount of your pTokens. It is not necessary to approve the euler address.
    /// @param spender Trusted address
    /// @param amount Use max uint256 for "infinite" allowance
    function approve(address spender, uint amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }



    /// @notice Convert underlying tokens to pTokens
    /// @param amount In underlying units (which are equivalent to pToken units)
    function wrap(uint amount) external {
        Utils.safeTransferFrom(eTokenAddr, msg.sender, address(this), amount);
        claimSurplus(msg.sender);
    }

    /// @notice Convert pTokens to underlying tokens
    /// @param amount In pToken units (which are equivalent to underlying units)
    function unwrap(uint amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");

        totalBalances -= amount;
        balances[msg.sender] -= amount;

        Utils.safeTransfer(eTokenAddr, msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    // Only callable by the euler contract:
    function creditUnwrap(address who, uint amount) external {
        require(msg.sender == euler, "permission denied");
        require(balances[who] >= amount, "insufficient balance");

        totalBalances -= amount;
        balances[who] -= amount;

        //Utils.safeTransfer(eTokenAddr, who, amount);
        emit Transfer(who, address(0), amount);
    }

    /// @notice Claim any surplus tokens held by the PToken contract. This should only be used by contracts.
    /// @param who Beneficiary to be credited for the surplus token amount
    function claimSurplus(address who) public {
        uint currBalance = IERC20(eTokenAddr).balanceOf(address(this));
        require(currBalance > totalBalances, "no surplus balance to claim");

        uint amount = currBalance - totalBalances;

        totalBalances += amount;
        balances[who] += amount;
        emit Transfer(address(0), who, amount);
    }


    // Internal shared:
    /*
    function doUnwrap(address who, uint amount) private {
        require(balances[who] >= amount, "insufficient balance");

        totalBalances -= amount;
        balances[who] -= amount;

        Utils.safeTransfer(eTokenAddr, who, amount);
        emit Transfer(who, address(0), amount);
    }*/
}
