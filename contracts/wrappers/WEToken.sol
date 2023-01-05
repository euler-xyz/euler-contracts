// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Interfaces.sol";
import "../Utils.sol";

interface IEuler {
    function moduleIdToProxy(uint moduleId) external view returns (address);
}

interface IMarkets {
    function underlyingToEToken(address underlying) external view returns (address);
}

/// @notice Wrapped eTokens are used in conjuncion with config overrides to create secondary, user configured markets on top of Euler
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


    /// @notice WEToken name, e.g. "Wrapped eDAI"
    function name() external view returns (string memory) {
        return string(abi.encodePacked("Wrapped ", IERC20(eTokenAddr).name()));
    }

    /// @notice WEToken symbol, e.g. "weDAI"
    function symbol() external view returns (string memory) {
        return string(abi.encodePacked("w", IERC20(eTokenAddr).symbol()));
    }

    /// @notice Number of decimals, same as underlying eToken - always normalised to 18
    function decimals() external pure returns (uint8) {
        return 18;
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


    /// @notice Transfer your own weTokens to another address
    /// @param recipient Recipient address
    /// @param amount Amount of wrapped token to transfer
    function transfer(address recipient, uint amount) external returns (bool) {
        return transferFrom(msg.sender, recipient, amount);
    }

    /// @notice Transfer weTokens from one address to another. The euler address is automatically granted approval.
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

    /// @notice Allow spender to access an amount of your weTokens. It is not necessary to approve the euler address.
    /// @param spender Trusted address
    /// @param amount Use max uint256 for "infinite" allowance
    function approve(address spender, uint amount) external returns (bool) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }



    /// @notice Convert underlying eTokens to weTokens
    /// @param subAccountId The sub-account id to transfer eTokens from
    /// @param amount of eTokens to wrap
    function wrap(uint subAccountId, uint amount) external {
        address account = getSubAccount(msg.sender, subAccountId);
        Utils.safeTransferFrom(eTokenAddr, account, address(this), amount);
        claimSurplus(msg.sender);
    }

    /// @notice Convert weTokens to underlying eTokens
    /// @param subAccountId The sub-account id to transfer eTokens to
    /// @param amount of eTokens to unwrap
    function unwrap(uint subAccountId, uint amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");
        address account = getSubAccount(msg.sender, subAccountId);

        totalBalances -= amount;
        balances[msg.sender] -= amount;

        Utils.safeTransfer(eTokenAddr, account, amount);
        emit Transfer(msg.sender, address(0), amount);
    }

    // Only callable by the euler contract:
    function creditUnwrap(address who, uint amount) external returns (uint256) {
        require(msg.sender == euler, "permission denied");

        if (amount == type(uint).max) amount = balances[who];
        require(balances[who] >= amount, "insufficient balance");

        totalBalances -= amount;
        balances[who] -= amount;

        emit Transfer(who, address(0), amount);

        return amount;
    }

    /// @notice Claim any surplus tokens held by the WEToken contract. This should only be used by contracts.
    /// @param who Beneficiary to be credited for the surplus token amount
    function claimSurplus(address who) public {
        uint currBalance = IERC20(eTokenAddr).balanceOf(address(this));
        require(currBalance > totalBalances, "no surplus balance to claim");

        uint amount = currBalance - totalBalances;

        totalBalances += amount;
        balances[who] += amount;
        emit Transfer(address(0), who, amount);
    }

    function getSubAccount(address primary, uint subAccountId) private pure returns (address) {
        require(subAccountId < 256, "sub-account too big");
        return address(uint160(primary) ^ uint160(subAccountId));
    }
}
