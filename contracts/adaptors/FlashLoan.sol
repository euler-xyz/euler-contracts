// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Interfaces.sol";

contract FlashLoan is IERC3156FlashLender, IDeferredLiquidityCheck {
    bytes32 public constant CALLBACK_SUCCESS = keccak256("ERC3156FlashBorrower.onFlashLoan");
    uint public constant FEE = 0;
    
    address eulerAddress;
    IExec exec;
    IMarkets markets;

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
        require(markets.underlyingToEToken(token) != address(0), "e/flash-fee/unsupported-token");

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

    function onDeferredLiquidityCheck(bytes memory encodedData) external override {
        (IERC3156FlashBorrower receiver, address token, uint amount, bytes memory data, address msgSender) =
            abi.decode(encodedData, (IERC3156FlashBorrower, address, uint, bytes, address));

        _isDeferredLiquidityCheck = true;
        _loan(receiver, token, amount, data, msgSender);
    }

    function _loan(IERC3156FlashBorrower receiver, address token, uint256 amount, bytes memory data, address msgSender) internal {
        address dTokenAddr = markets.underlyingToDToken(token);
        IDToken dToken = IDToken(dTokenAddr);
        IERC20 underlying = IERC20(token);

        require(dToken.borrow(0, amount), "e/flash-loan/borrow");
        require(underlying.transfer(address(receiver), amount), "e/flash-loan/transfer");
        require(
            receiver.onFlashLoan(msgSender, token, amount, FEE, data) == CALLBACK_SUCCESS,
            "e/flash-loan/callback"
        );
        require(
            underlying.transferFrom(address(receiver), address(this), amount + FEE),
            "e/flash-loan/pull"
        );

        uint allowance = underlying.allowance(address(this), eulerAddress);
        underlying.approve(eulerAddress, allowance + amount + FEE);

        require(dToken.repay(0, amount), "e/flash-loan/repay");
    }
}