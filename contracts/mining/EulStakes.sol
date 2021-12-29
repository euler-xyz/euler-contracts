// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Utils.sol";

contract EulStakes {
    address public immutable eul;
    string public constant name = "EUL Stakes";
    mapping(address => mapping(address => uint)) public staked;

    event Stake(address indexed who, address indexed underlying, uint oldAmount, uint newAmount);

    constructor(address eul_) {
        eul = eul_;
    }

    struct StakeOp {
        address underlying;
        int amount;
    }

    function stake(StakeOp[] memory ops) public {
        int delta = 0;

        for (uint i = 0; i < ops.length; i++) {
            StakeOp memory op = ops[i];
            if (op.amount == 0) continue;

            require(op.amount > -1e36 && op.amount < 1e36, "amount out of range");

            uint oldAmount = staked[msg.sender][op.underlying];
            uint newAmount;

            {
                int newAmountSigned = int(oldAmount) + op.amount;
                require(newAmountSigned >= 0, "insufficient staked");
                newAmount = uint(newAmountSigned);
            }

            staked[msg.sender][op.underlying] = newAmount;
            emit Stake(msg.sender, op.underlying, oldAmount, newAmount);

            delta += op.amount;
        }

        if (delta > 0) {
            Utils.safeTransferFrom(eul, msg.sender, address(this), uint(delta));
        } else if (delta < 0) {
            Utils.safeTransfer(eul, msg.sender, uint(-delta));
        }
    }

    function stakeGift(address beneficiary, address underlying, uint amount) external {
        require(amount < 1e36, "amount out of range");

        uint oldAmount = staked[beneficiary][underlying];
        uint newAmount = oldAmount + amount;

        staked[beneficiary][underlying] = newAmount;
        emit Stake(beneficiary, underlying, oldAmount, newAmount);

        Utils.safeTransferFrom(eul, msg.sender, address(this), amount);
    }

    function stakePermit(StakeOp[] memory ops, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s) external {
        IERC20Permit(eul).permit(msg.sender, address(this), value, deadline, v, r, s);

        stake(ops);
    }
}
