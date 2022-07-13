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
    bytes32 public currRoot;
    bytes32 public prevRoot;
    mapping(address => mapping(address => uint)) public claimed; // account -> token -> amount

    event OwnerChanged(address indexed newOwner);

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
        emit OwnerChanged(newOwner);
    }

    function updateRoot(bytes32 newRoot) external onlyOwner {
        prevRoot = currRoot;
        currRoot = newRoot;
    }

    // Claiming

    /// @notice Claim distributed tokens
    /// @param account Address that should receive tokens
    /// @param token Address of token being claimed (ie EUL)
    /// @param proof Merkle proof that validates this claim
    /// @param stake If non-zero, then the address of a token to auto-stake to, instead of claiming
    function claim(address account, address token, uint claimable, bytes32[] calldata proof, address stake) external {
        bytes32 candidateRoot = MerkleProof.processProof(proof, keccak256(abi.encodePacked(account, token, claimable))); // 72 byte leaf
        require(candidateRoot == currRoot || candidateRoot == prevRoot, "proof invalid/expired");

        uint alreadyClaimed = claimed[account][token];
        require(claimable > alreadyClaimed, "already claimed");

        uint amount;
        unchecked {
            amount = claimable - alreadyClaimed;
        }

        claimed[account][token] = claimable;

        if (stake == address(0)) {
            Utils.safeTransfer(token, account, amount);
        } else {
            require(msg.sender == account, "can only auto-stake for yourself");
            require(token == eul, "can only auto-stake EUL");
            IEulStakes(eulStakes).stakeGift(account, stake, amount);
        }
    }
}
