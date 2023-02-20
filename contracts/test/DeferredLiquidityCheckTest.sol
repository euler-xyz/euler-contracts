// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../modules/Exec.sol";
import "../modules/Markets.sol";
import "../modules/DToken.sol";


contract DeferredLiquidityCheckTest is IDeferredLiquidityCheck {
    uint constant AMOUNT = 1 ether;
    address euler;
    address markets;
    address exec;

    event onDeferredLiquidityCheckEvent();

    constructor(address eulerAddr, address marketsAddr, address execAddr) {
        euler = eulerAddr;
        markets = marketsAddr;
        exec = execAddr;
    }

    function getSubAccount(uint subAccountId) internal view returns (address) {
        require(subAccountId < 256, "sub-account-id-too-big");
        return address(uint160(address(this)) ^ uint160(subAccountId));
    }

    function onDeferredLiquidityCheck(bytes memory data) external override {
        (address underlying, address[] memory accounts, uint scenario) = abi.decode(data, (address, address[], uint));
        
        address dToken = Markets(markets).underlyingToDToken(underlying);
        IERC20(underlying).approve(euler, type(uint).max);
        emit onDeferredLiquidityCheckEvent();
        
        if (scenario == 1) {
            DToken(dToken).borrow(0, AMOUNT);
            DToken(dToken).repay(0, AMOUNT);
        } else if (scenario == 2) {
            DToken(dToken).borrow(0, AMOUNT);
            DToken(dToken).borrow(1, AMOUNT);
            DToken(dToken).repay(0, AMOUNT);
            DToken(dToken).repay(1, AMOUNT);
        } else if (scenario == 3) {
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, 1));
        } else if (scenario == 4) {
            Exec(exec).deferLiquidityCheck(accounts[accounts.length - 1], abi.encode(underlying, accounts, 1));
        } else if (scenario == 5) {
            address account = getSubAccount(1);
            accounts[0] = account;
            Exec(exec).deferLiquidityCheck(account, abi.encode(underlying, accounts, 1));
            Exec(exec).deferLiquidityCheck(account, abi.encode(underlying, accounts, 2));
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, 1));
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, 2));
        } else if (scenario == 6) {
            Exec.EulerBatchItem[] memory items = new Exec.EulerBatchItem[](2);
            items[0] = Exec.EulerBatchItem(false, dToken, abi.encodeWithSelector(DToken.borrow.selector, 0, AMOUNT));
            items[1] = Exec.EulerBatchItem(false, dToken, abi.encodeWithSelector(DToken.repay.selector, 0, AMOUNT));
            accounts[0] = getSubAccount(0);
            Exec(exec).batchDispatch(items, accounts);
        } else if (scenario == 7) {
            Exec.EulerBatchItem[] memory items = new Exec.EulerBatchItem[](2);
            items[0] = Exec.EulerBatchItem(false, dToken, abi.encodeWithSelector(DToken.borrow.selector, 0, AMOUNT));
            items[1] = Exec.EulerBatchItem(false, dToken, abi.encodeWithSelector(DToken.repay.selector, 0, AMOUNT));
            accounts[0] = getSubAccount(0);
            accounts[1] = address(0);
            Exec(exec).batchDispatch(items, accounts);
        } else {
            revert("onDeferredLiquidityCheck: wrong scenario");
        }
    }

    function test(address underlying, address[] memory accounts, uint scenario) external {
        if (scenario == 1) {
            Exec(exec).deferLiquidityCheck(accounts[0], abi.encode(underlying, accounts, scenario));
        } else if (scenario == 2) {
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, scenario));
        } else if (scenario == 3) {
            Exec(exec).deferLiquidityCheck(accounts[0], abi.encode(underlying, accounts, scenario));
        } else if (scenario == 4) {
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, scenario));
        } else if (scenario == 5) {
            Exec(exec).deferLiquidityCheck(accounts[0], abi.encode(underlying, accounts, scenario));
        } else if (scenario == 6) {
            Exec(exec).deferLiquidityCheck(accounts[0], abi.encode(underlying, accounts, scenario));
        } else if (scenario == 7) {
            Exec(exec).deferLiquidityCheckMulti(accounts, abi.encode(underlying, accounts, scenario));
        } else if (scenario == 8) {
            Exec.EulerBatchItem[] memory items = new Exec.EulerBatchItem[](1);
            items[0] = Exec.EulerBatchItem(
                false, 
                exec, 
                abi.encodeWithSelector(
                    Exec.deferLiquidityCheck.selector,
                    accounts[0],
                    abi.encode(underlying, accounts, 1)
                )
            );
            Exec(exec).batchDispatch(items, accounts);
        } else if (scenario == 9) {
            Exec.EulerBatchItem[] memory items = new Exec.EulerBatchItem[](1);
            items[0] = Exec.EulerBatchItem(
                false, 
                exec, 
                abi.encodeWithSelector(
                    Exec.deferLiquidityCheckMulti.selector,
                    accounts,
                    abi.encode(underlying, accounts, 1)
                )
            );
            Exec(exec).batchDispatch(items, accounts);
        } else if (scenario == 10) {
            Exec.EulerBatchItem[] memory items = new Exec.EulerBatchItem[](1);
            items[0] = Exec.EulerBatchItem(
                false, 
                exec, 
                abi.encodeWithSelector(
                    Exec.deferLiquidityCheck.selector,
                    getSubAccount(1),
                    abi.encode(underlying, accounts, 1)
                )
            );
            Exec(exec).batchDispatch(items, accounts);
        } else {
            revert("test: wrong scenario");
        }
    }
}
