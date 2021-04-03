// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";


contract Proxy {
    address immutable euler;
    uint immutable moduleId;

    constructor(uint moduleId_) {
        euler = msg.sender;
        moduleId = moduleId_;
    }

    // External interface

    fallback () external {
        address euler_ = euler;

        if (msg.sender == euler_) {
            (bytes32[] memory topics, bytes memory data) = abi.decode(msg.data, (bytes32[], bytes));

            assembly {
                let p := add(data, 32)
                let s := mload(data)

                switch mload(topics)
                case 0 { log0(p, s) }
                case 1 { log1(p, s, mload(add(topics, 32))) }
                case 2 { log2(p, s, mload(add(topics, 32)), mload(add(topics, 64))) }
                case 3 { log3(p, s, mload(add(topics, 32)), mload(add(topics, 64)), mload(add(topics, 96))) }
                case 4 { log4(p, s, mload(add(topics, 32)), mload(add(topics, 64)), mload(add(topics, 96)), mload(add(topics, 128))) }
                default { revert(0, 0) }
            }
        } else {
            uint moduleId_ = moduleId;

            assembly {
                mstore(0, 0xe9c4a3ac00000000000000000000000000000000000000000000000000000000) // dispatch() selector
                calldatacopy(4, 0, calldatasize())
                mstore(add(4, calldatasize()), shl(mul(12, 8), caller()))
                mstore(add(24, calldatasize()), shl(mul(28, 8), moduleId_))

                let result := call(gas(), euler_, 0, 0, add(28, calldatasize()), 0, 0)

                returndatacopy(0, 0, returndatasize())

                switch result
                case 0 { revert(0, returndatasize()) }
                default { return(0, returndatasize()) }
            }
        }
    }
}
