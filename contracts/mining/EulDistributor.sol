// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../vendor/MerkleProof.sol";
import "../Utils.sol";

interface IEulStakes {
    function stakeGift(address beneficiary, address underlying, uint amount) external;
}

contract EulDistributor {
    address public immutable eul;
    address public immutable eulStakes;
    string public constant name = "EUL Distributor";

    address public owner;
    bytes32 currRoot;
    bytes32 prevRoot;
    mapping(address => mapping(address => uint)) public claimed; // account -> token -> amount

    constructor(address eul_, address eulStakes_) {
        eul = eul_;
        eulStakes = eulStakes_;
        owner = msg.sender;
        Utils.safeApprove(eul_, eulStakes_, type(uint).max);
    }

    // Owner functions

    modifier onlyOwner {
        require(msg.sender == owner, "unauthorized");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    function updateRoot(bytes32 newRoot) external onlyOwner {
        prevRoot = currRoot;
        currRoot = newRoot;
    }

    // Claiming

    function claim(address account, address token, uint claimable, bytes32[] calldata proof, address stake) external {
        bytes32 candidateRoot = MerkleProof.processProof(proof, keccak256(abi.encodePacked(account, token, claimable)));
        require(candidateRoot == currRoot || candidateRoot == prevRoot, "proof invalid/expired");

        uint alreadyClaimed = claimed[account][token];
        require(claimable > alreadyClaimed, "already claimed");
        uint amount = claimable - alreadyClaimed;

        if (stake == address(0)) {
            Utils.safeTransfer(eul, account, amount);
        } else {
            require(msg.sender == account, "can only auto-stake for yourself");
            require(token == eul, "can only auto-stake EUL");
            IEulStakes(eulStakes).stakeGift(account, stake, amount);
        }
    }
}
