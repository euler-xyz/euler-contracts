// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";

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



    function wrap(uint amount) external {
        totalSupply += amount;
        balanceOf[msg.sender] += amount;

        safeTransferFrom(underlying, msg.sender, address(this), amount);
        emit Transfer(address(0), msg.sender, amount);
    }

    function unwrap(uint amount) external {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");

        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;

        safeTransfer(underlying, msg.sender, amount);
        emit Transfer(msg.sender, address(0), amount);
    }



    function safeTransferFrom(address token, address from, address to, uint value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), string(data));
    }

    function safeTransfer(address token, address to, uint value) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), string(data));
    }
}
