pragma solidity ^0.8.0;
// SPDX-License-Identifier: GPL-2.0-or-later

import "hardhat/console.sol";

import "../Constants.sol";
import "../Euler.sol";
import "../modules/Markets.sol";
import "../modules/EToken.sol";
import "../modules/DToken.sol";

// This is a testing-only contract that verifies invariants of the Euler system.

struct LocalVars {
    uint eTokenBalances;
    uint dTokenBalances;
    uint dTokenBalancesExact;

    uint numUsersWithEtokens;
    uint numUsersWithDtokens;

    uint eTokenTotalSupply;
    uint reserveBalance;
    uint dTokenTotalSupply;
    uint dTokenTotalSupplyExact;

    uint poolSize;
}

contract InvariantChecker is Constants {
    function check(address eulerContract, address[] calldata markets, address[] calldata accounts, bool verbose) external view {
        Euler eulerProxy = Euler(eulerContract);
        Markets marketsProxy = Markets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));

        LocalVars memory v;

        for (uint i = 0; i < markets.length; ++i) {
            IERC20 eToken = IERC20(marketsProxy.underlyingToEToken(markets[i]));
            IERC20 dToken = IERC20(marketsProxy.eTokenToDToken(address(eToken)));

            v.eTokenBalances = 0;
            v.dTokenBalances = 0;
            v.dTokenBalancesExact = 0;

            v.numUsersWithEtokens = 0;
            v.numUsersWithDtokens = 0;

            for (uint j = 0; j < accounts.length; ++j) {
                address account = accounts[j];

                {
                    uint bal = eToken.balanceOf(account);
                    v.eTokenBalances += bal;
                    if (bal != 0) v.numUsersWithEtokens++;
                }

                {
                    uint bal = dToken.balanceOf(account);
                    v.dTokenBalances += bal;
                    if (bal != 0) v.numUsersWithDtokens++;
                }

                {
                    uint bal = DToken(address(dToken)).balanceOfExact(account);
                    v.dTokenBalancesExact += bal;
                }
            }

            v.eTokenTotalSupply = eToken.totalSupply();
            v.reserveBalance = EToken(address(eToken)).reserveBalance();
            v.dTokenTotalSupply = dToken.totalSupply();
            v.dTokenTotalSupplyExact = DToken(address(dToken)).totalSupplyExact();

            v.poolSize = IERC20(markets[i]).balanceOf(eulerContract);

            if (verbose) {
                console.log("--------------------------------------------------------------");
                console.log("MARKET = ", markets[i]);
                console.log("POOL SIZE           = ", v.poolSize);
                console.log("");
                console.log("USERS WITH ETOKENS  = ", v.numUsersWithEtokens);
                console.log("ETOKEN BALANCE SUM  = ", v.eTokenBalances);
                console.log("RESERVE BALANCE     = ", v.reserveBalance);
                console.log("ETOKEN TOTAL SUPPLY = ", v.eTokenTotalSupply);
                console.log("");
                console.log("USERS WITH DTOKENS  = ", v.numUsersWithDtokens);
                console.log("DTOKEN BALANCE SUM  = ", v.dTokenBalances);
                console.log("DTOKEN TOTAL SUPPLY = ", v.dTokenTotalSupply);
                console.log("DTOKEN BALEXACT SUM = ", v.dTokenBalancesExact);
                console.log("DTOKEN EXACT SUPPLY = ", v.dTokenTotalSupplyExact);
            }

            require(v.eTokenBalances + v.reserveBalance == v.eTokenTotalSupply, "invariant checker: eToken balance mismatch");

            // Due to rounding, user debt balances can grow slightly faster than the total debt supply
            require(v.dTokenBalancesExact >= v.dTokenTotalSupplyExact, "invariant checker: dToken exact balance mismatch");
        }
    }
}
