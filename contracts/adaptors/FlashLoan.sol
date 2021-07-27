// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";
import "../BaseLogic.sol";

contract FlashLoan is IERC3156FlashLender, IDeferredLiquidityCheck, BaseLogic(0) {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint public constant FEE = 0;
    
    address immutable eulerAddress;
    IExec immutable exec;
    IMarkets immutable markets;

    bool internal _isDeferredLiquidityCheck;
    
    constructor(address euler_, address exec_, address markets_) {
        eulerAddress = euler_;
        exec = IExec(exec_);
        markets = IMarkets(markets_);
    }

    function maxFlashLoan(address token) override external view returns (uint) {
        address eTokenAddress = markets.underlyingToEToken(token);

        return eTokenAddress == address(0) ? 0 : IERC20(token).balanceOf(eulerAddress);
    }

    function flashFee(address token, uint) override external view returns (uint) {
        require(markets.underlyingToEToken(token) != address(0), "e/flash-loan/unsupported-token");

        return FEE;
    }

    function flashLoan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes calldata data) override external returns (bool) {
        require(markets.underlyingToEToken(token) != address(0), "e/flash-loan/unsupported-token");

        if(!_isDeferredLiquidityCheck) {
            exec.deferLiquidityCheck(address(this), abi.encode(receiver, token, amount, data, msg.sender));
            _isDeferredLiquidityCheck = false;
        } else {
            _loan(receiver, token, amount, data, msg.sender);
        }
        
        return true;
    }

    function onDeferredLiquidityCheck(bytes memory encodedData) override external {
        require(msg.sender == eulerAddress, "e/flash-loan/on-deferred-caller");
        (IERC3156FlashBorrower receiver, address token, uint amount, bytes memory data, address msgSender) =
            abi.decode(encodedData, (IERC3156FlashBorrower, address, uint, bytes, address));

        _isDeferredLiquidityCheck = true;
        _loan(receiver, token, amount, data, msgSender);

        _exitAllMarkets();
    }

    function _loan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes memory data, address msgSender) internal {
        address dTokenAddr = markets.underlyingToDToken(token);
        IDToken dToken = IDToken(dTokenAddr);

        dToken.borrow(0, amount);
        safeTransfer(token, address(receiver), amount);

        require(
            receiver.onFlashLoan(msgSender, token, amount, FEE, data) == CALLBACK_SUCCESS,
            "e/flash-loan/callback"
        );

        safeTransferFrom(token, address(receiver), address(this), amount + FEE);
        uint allowance = IERC20(token).allowance(address(this), eulerAddress);
        if(allowance < amount + FEE) {
            IERC20(token).approve(eulerAddress, type(uint).max);
        }

        dToken.repay(0, amount);
    }

    function _exitAllMarkets() internal {
        address[] memory enteredMarkets = markets.getEnteredMarkets(address(this));

        for (uint i = 0; i < enteredMarkets.length; i++) {
            markets.exitMarket(0, enteredMarkets[i]);
        }
    }
}
