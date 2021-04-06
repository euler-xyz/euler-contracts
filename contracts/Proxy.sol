// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";


contract Proxy {
    address immutable creator;

    constructor() {
        creator = msg.sender;
    }

    // External interface

    fallback() external {
        address creator_ = creator;

        if (msg.sender == creator_) {
            assembly {
                mstore(0, 0)
                calldatacopy(31, 0, 1)

                switch mload(0) // numTopics
                    case 0 { log0(1,   sub(calldatasize(), 1)) }
                    case 1 { log1(33,  sub(calldatasize(), 33),  calldataload(1)) }
                    case 2 { log2(65,  sub(calldatasize(), 65),  calldataload(1), calldataload(33)) }
                    case 3 { log3(97,  sub(calldatasize(), 97),  calldataload(1), calldataload(33), calldataload(65)) }
                    case 4 { log4(129, sub(calldatasize(), 129), calldataload(1), calldataload(33), calldataload(65), calldataload(97)) }
                    default { revert(0, 0) }
            }
        } else {
            assembly {
                mstore(0, 0xe9c4a3ac00000000000000000000000000000000000000000000000000000000) // dispatch() selector
                calldatacopy(4, 0, calldatasize())
                mstore(add(4, calldatasize()), shl(96, caller()))

                let result := call(gas(), creator_, 0, 0, add(24, calldatasize()), 0, 0)
                returndatacopy(0, 0, returndatasize())

                switch result
                    case 0 { revert(0, returndatasize()) }
                    default { return(0, returndatasize()) }
            }
        }
    }
}
