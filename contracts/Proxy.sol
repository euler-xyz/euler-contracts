// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Interfaces.sol";


contract Proxy {
    address immutable euler;
    uint immutable moduleId;

    constructor(address euler_, uint moduleId_) {
        euler = euler_;
        moduleId = moduleId_;
    }

    // External interface

    fallback () external {
        if (msg.sender == euler) {
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
            bytes memory ret = IEuler(euler).dispatch(moduleId, msg.sender, msg.data);

            assembly {
                return(add(32, ret), mload(ret))
            }
        }
    }
}
