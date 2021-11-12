// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Interfaces.sol";

contract FlashLoanAdaptorTest is IERC3156FlashBorrower {

    event BorrowResult(address token, uint balance, uint fee, uint borrowIndex, address sender, address initiator);

    function setMaxAllowance(address token, address to) public returns (bool success) {
        (success,) = token.call(abi.encodeWithSelector(IERC20.approve.selector, to, type(uint).max));
    }

    function testFlashBorrow(address lender, address[] calldata receivers, address[] calldata tokens, uint[] calldata amounts) external {
        bytes memory data = abi.encode(receivers, tokens, amounts, 0);
        
        _borrow(lender, receivers[0], tokens[0], amounts[0], data);

        for (uint i = 0; i < receivers.length; ++i) {
            for (uint j = 0; j < tokens.length; ++j) {
                assert(IERC20(tokens[j]).balanceOf(receivers[i]) == 0);
            }
        }
    }

    function onFlashLoan(address initiator, address token, uint256, uint256 fee, bytes calldata data) override external returns(bytes32) {
        (address[] memory receivers, address[] memory tokens, uint[] memory amounts, uint borrowIndex) = 
            abi.decode(data, (address[], address[], uint[], uint));
            
        setMaxAllowance(token, msg.sender);

        _emitBorrowResult(token, fee, borrowIndex, initiator);

        if(tokens.length > 0 && borrowIndex < tokens.length - 1) {
            uint nextBorrowIndex = borrowIndex + 1;
            _borrow(
                msg.sender,
                receivers[nextBorrowIndex],
                tokens[nextBorrowIndex],
                amounts[nextBorrowIndex],
                abi.encode(receivers, tokens, amounts, nextBorrowIndex)
            );
        }

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }

    function _borrow(address lender, address receiver, address token, uint amount, bytes memory data) internal {
        IERC3156FlashLender(lender).flashLoan(IERC3156FlashBorrower(receiver), token, amount, data);
    }

    function _emitBorrowResult(address token, uint fee, uint borrowIndex, address initiator) internal {
        emit BorrowResult(
            token,
            IERC20(token).balanceOf(address(this)),
            fee,
            borrowIndex,
            msg.sender,
            initiator
        );
    }
}
