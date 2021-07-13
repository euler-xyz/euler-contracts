// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";


contract LiquidationBot {
    address immutable owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function raw(address to, bytes calldata data, uint value) external onlyOwner {
        (bool success, bytes memory result) = to.call{ value: value }(data);
        if (!success) revertBytes(result);
    }

    function liquidate(address liquidationModule, address swapRouter, address violator, address underlying, address collateral) external onlyOwner {
        ILiquidation.LiquidationOpportunity memory liqOpp = ILiquidation(liquidationModule).checkLiquidation(address(this), violator, underlying, collateral);
    }



    function revertBytes(bytes memory errMsg) internal pure {
        if (errMsg.length > 0) {
            assembly {
                revert(add(32, errMsg), mload(errMsg))
            }
        }

        revert("e/empty-error");
    }
}
