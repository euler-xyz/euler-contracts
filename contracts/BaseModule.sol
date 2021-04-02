// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Base.sol";
import "./Interfaces.sol";


abstract contract BaseModule is Base {
    // Construction

    uint immutable public moduleId; // public accessor common to all modules

    constructor(uint moduleId_) {
        moduleId = moduleId_;
    }


    // Accessing parameters

    function unpackTrailingParams() internal pure returns (address proxyAddr, address msgSender) {
        (proxyAddr, msgSender) = abi.decode(msg.data[(msg.data.length - 64):], (address, address));
    }


    // Emit logs via proxies

    function emitViaProxy_Transfer(address proxyAddr, address from, address to, uint value) internal FREEMEM {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256(bytes('Transfer(address,address,uint256)'));
        topics[1] = bytes32(uint(uint160(from)));
        topics[2] = bytes32(uint(uint160(to)));
        (bool success,) = proxyAddr.call(abi.encode(topics, abi.encode(value)));
        require(success, "e/log-proxy-fail");
    }

    function emitViaProxy_Approval(address proxyAddr, address owner, address spender, uint value) internal FREEMEM {
        bytes32[] memory topics = new bytes32[](3);
        topics[0] = keccak256(bytes('Approval(address,address,uint256)'));
        topics[1] = bytes32(uint(uint160(owner)));
        topics[2] = bytes32(uint(uint160(spender)));
        (bool success,) = proxyAddr.call(abi.encode(topics, abi.encode(value)));
        require(success, "e/log-proxy-fail");
    }
}