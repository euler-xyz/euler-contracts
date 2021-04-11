// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";
import "../modules/EToken.sol";
import "../modules/Markets.sol";


contract LiquidationTest is ILiquidator {
    bool isDryRun;
    uint repayDesired;
    ILiquidation.LiquidationOpportunity tempLiqOpp; // just so we can return it from callback

    function liquidateDryRun(address liquidationContract, address violator, address underlying, address collateral) external returns (ILiquidation.LiquidationOpportunity memory output) {
        isDryRun = true;

        ILiquidation(liquidationContract).liquidate(violator, underlying, collateral);

        output = tempLiqOpp;
        delete tempLiqOpp;
    }

    function liquidateForReal(address liquidationContract, address violator, address underlying, address collateral, uint repayDesired_) external {
        isDryRun = false;
        repayDesired = repayDesired_;

        ILiquidation(liquidationContract).liquidate(violator, underlying, collateral);
    }

    function onLiquidationOffer(ILiquidation.LiquidationOpportunity calldata liqOpp) external override returns (uint) {
        if (isDryRun) {
            tempLiqOpp = liqOpp;
            return 0;
        }

        return repayDesired;
    }

    /// Smart contract wallet utils

    function approve(address eulerContract, address underlying) external {
        IERC20(underlying).approve(eulerContract, type(uint).max);
    }

    function enterMarket(address marketsAddr, uint subAccountId, address underlying) external {
        Markets(marketsAddr).enterMarket(subAccountId, underlying);
    }

    function deposit(address eTokenAddr, uint subAccountId, uint amount) external {
        EToken(eTokenAddr).deposit(subAccountId, amount);
    }
}
