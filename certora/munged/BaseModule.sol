// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Base.sol";


abstract contract BaseModule is Base {
    // Construction

    uint immutable public moduleId; // public accessor common to all modules

    // We need to remove the argument because we use diamond inheritance for the
    // CVT harness.  Since the constructor cannot be called with different
    // arguments in the different intermediate classes, we remove the argument.
    constructor() {
        moduleId = 0;
    }


    // Accessing parameters

    function unpackTrailingParamMsgSender() virtual internal view returns (address msgSender) {
        assembly {
            mstore(0, 0)

            calldatacopy(12, sub(calldatasize(), 40), 20)
            msgSender := mload(0)
        }
    }

    function unpackTrailingParams() virtual internal view returns (address msgSender, address proxyAddr) {
        assembly {
            mstore(0, 0)

            calldatacopy(12, sub(calldatasize(), 40), 20)
            msgSender := mload(0)

            calldatacopy(12, sub(calldatasize(), 20), 20)
            proxyAddr := mload(0)
        }
    }


    // Emit logs via proxies

    function emitViaProxy_Transfer(address proxyAddr, address from, address to, uint value) internal virtual {
     
    }

    function emitViaProxy_Approval(address proxyAddr, address owner, address spender, uint value) internal virtual {
       
    }
}
