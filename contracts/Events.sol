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

    event Liquidation(address indexed liquidator, address indexed violator, address indexed underlying, address collateral, uint repay, uint yield, uint healthScore, uint baseDiscount, uint discount);

    event AssetStatus(address indexed underlying, uint totalBalances, uint totalBorrows, uint96 reserveBalance, uint poolSize, uint interestAccumulator, int96 interestRate, uint timestamp);

    event ReservesConverted(address indexed underlying, address indexed recipient, uint amount);
}
