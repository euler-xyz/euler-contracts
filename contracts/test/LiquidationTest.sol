// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";


contract LiquidationTest is ILiquidator {
    ILiquidation.LiquidationOpportunity tempLiqOpp; // just so we can return it from callback

    function liquidationDryRun(address liquidationContract, address violator, address underlying, address collateral) external returns (ILiquidation.LiquidationOpportunity memory output) {
        ILiquidation liquidationProxy = ILiquidation(liquidationContract);

        liquidationProxy.liquidate(violator, underlying, collateral);

        output = tempLiqOpp;
        delete tempLiqOpp;
    }

    function onLiquidationOffer(ILiquidation.LiquidationOpportunity calldata liqOpp) external override returns (uint) {
        tempLiqOpp = liqOpp;
        return 0;
    }
}
