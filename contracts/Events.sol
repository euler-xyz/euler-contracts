// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

abstract contract Events {
    event Genesis();

    event ProxyCreated(address indexed proxy, uint moduleId);
    event MarketActivated(address indexed underlying, address indexed eToken, address indexed dToken);

    event EnterMarket(address indexed underlying, address indexed account);
    event ExitMarket(address indexed underlying, address indexed account);

    event Deposit(address indexed underlying, address indexed account, uint amount);
    event Withdraw(address indexed underlying, address indexed account, uint amount);
    event Borrow(address indexed underlying, address indexed account, uint amount);
    event Repay(address indexed underlying, address indexed account, uint amount);

    event ReservesConverted(address indexed underlying, address indexed recipient, uint amount);
}
