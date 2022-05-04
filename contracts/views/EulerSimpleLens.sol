// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Euler.sol";
import "../modules/EToken.sol";
import "../modules/Markets.sol";
import "../modules/Exec.sol";

contract EulerSimpleLens is Constants {
    bytes32 immutable public moduleGitCommit;
    Euler immutable public euler;
    Markets immutable public markets;
    Exec immutable public exec;

    constructor(bytes32 moduleGitCommit_, address euler_) {
        moduleGitCommit = moduleGitCommit_;

        euler = Euler(euler_);
        markets = Markets(euler.moduleIdToProxy(MODULEID__MARKETS));
        exec = Exec(euler.moduleIdToProxy(MODULEID__EXEC));
    }

    // underlying -> etoken
    // health score
    // interest rates as APYs
    // prices
    // balances and debts
    // approvals
    // total supply, total debts
    // reserves
    // asset configs
    // pricing configs
}
