pragma solidity ^0.8.0;
// SPDX-License-Identifier: UNLICENSED

contract TestERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address recipient, uint256 amount) external returns (bool) {
        return transferFrom(msg.sender, recipient, amount);
    }

    function transferFrom(address from, address recipient, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        if (from != msg.sender && allowance[from][msg.sender] != type(uint256).max) {
            require(allowance[from][msg.sender] >= amount, "ERC20: transfer amount exceeds allowance");
            allowance[from][msg.sender] -= amount;
        }
        balanceOf[from] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(from, recipient, amount);
        return true;
    }

    // Custom testing methods

    function mint(address who, uint amount) external {
        balanceOf[who] += amount;
        emit Transfer(address(0), who, amount);
    }

    function setBalance(address who, uint newBalance) external {
        balanceOf[who] = newBalance;
    }

    function changeDecimals(uint8 decimals_) external {
        decimals = decimals_;
    }

    function callSelfDestruct() external {
        selfdestruct(payable(address(0)));
    }
}
