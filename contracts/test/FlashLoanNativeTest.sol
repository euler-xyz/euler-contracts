// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";
import "../modules/DToken.sol";
import "../modules/Markets.sol";
import "../modules/Exec.sol";
import "../modules/DToken.sol";


contract FlashLoanNativeTest is IDeferredLiquidityCheck {
    struct CallbackData {
        address eulerAddr;
        address marketsAddr;
        address execAddr;
        address underlying;
        uint amount;
        bool payItBack;
    }

    function testFlashLoan(CallbackData calldata data) external {
        Exec(data.execAddr).deferLiquidityCheck(address(this), abi.encode(data));
    }

    function onDeferredLiquidityCheck(bytes memory encodedData) external override {
        CallbackData memory data = abi.decode(encodedData, (CallbackData));

        address dTokenAddr = Markets(data.marketsAddr).underlyingToDToken(data.underlying);
        DToken dToken = DToken(dTokenAddr);

        dToken.borrow(0, data.amount);

        require(IERC20(data.underlying).balanceOf(address(this)) == data.amount, "didn't receive underlying");
        require(dToken.balanceOf(address(this)) == data.amount, "didn't receive dTokens");

        if (data.payItBack) {
            IERC20(data.underlying).approve(data.eulerAddr, type(uint).max);
            dToken.repay(0, data.amount);

            require(IERC20(data.underlying).balanceOf(address(this)) == 0, "didn't repay underlying");
            require(dToken.balanceOf(address(this)) == 0, "didn't burn dTokens");
        }
    }
}
