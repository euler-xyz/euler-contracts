// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../Constants.sol";
import "../Storage.sol";
import "../Interfaces.sol";
import "../vendor/RPow.sol";



contract EulerGeneralView is Constants {
    // Query

    struct Query {
        address eulerContract;

        address account;
        address[] markets;
    }

    // Response

    struct ResponseMarket {
        // Universal

        address underlying;
        string name;
        string symbol;
        uint8 decimals;

        address eTokenAddr;
        address dTokenAddr;

        Storage.AssetConfig config;

        uint poolSize;
        uint totalBalances;
        uint totalBorrows;

        uint borrowSPY;
        uint supplySPY;
        uint borrowAPY;
        uint supplyAPY;

        // Pricing

        uint twap;
        uint twapPeriod;
        uint currPrice;

        // Account specific

        uint underlyingBalance;
        uint eulerAllowance;
        uint eTokenBalance;
        uint eTokenBalanceUnderlying;
        uint dTokenBalance;
        IRiskManager.LiquidityStatus liquidityStatus;
    }

    struct Response {
        ResponseMarket[] markets;
        address[] enteredMarkets;
    }



    // Implementation

    function doQuery(Query memory q) external returns (Response memory r) {
        IEuler eulerProxy = IEuler(q.eulerContract);

        IMarkets marketsProxy = IMarkets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));
        IExec execProxy = IExec(eulerProxy.moduleIdToProxy(MODULEID__EXEC));

        IRiskManager.AssetLiquidity[] memory liqs;

        if (q.account != address(0)) {
            liqs = execProxy.detailedLiquidity(q.account);
        }

        r.markets = new ResponseMarket[](liqs.length + q.markets.length);

        for (uint i = 0; i < liqs.length; i++) {
            ResponseMarket memory m = r.markets[i];

            m.underlying = liqs[i].underlying;
            m.liquidityStatus = liqs[i].status;

            populateResponseMarket(q, m, marketsProxy, execProxy);
        }

        for (uint j = liqs.length; j < liqs.length + q.markets.length; j++) {
            uint i = j - liqs.length;
            ResponseMarket memory m = r.markets[j];

            m.underlying = q.markets[i];

            populateResponseMarket(q, m, marketsProxy, execProxy);
        }

        if (q.account != address(0)) {
            r.enteredMarkets = marketsProxy.getEnteredMarkets(q.account);
        }
    }

    function populateResponseMarket(Query memory q, ResponseMarket memory m, IMarkets marketsProxy, IExec execProxy) private {
        m.name = IERC20(m.underlying).name();
        m.symbol = IERC20(m.underlying).symbol();
        m.decimals = IERC20(m.underlying).decimals();

        m.eTokenAddr = marketsProxy.underlyingToEToken(m.underlying);
        if (m.eTokenAddr == address(0)) return; // not activated

        m.dTokenAddr = marketsProxy.eTokenToDToken(m.eTokenAddr);

        {
            Storage.AssetConfig memory c = marketsProxy.underlyingToAssetConfig(m.underlying);
            m.config = c;
        }

        m.poolSize = IERC20(m.underlying).balanceOf(q.eulerContract);
        m.totalBalances = IEToken(m.eTokenAddr).totalSupplyUnderlying();
        m.totalBorrows = IERC20(m.dTokenAddr).totalSupply();

        m.borrowSPY = marketsProxy.interestRate(m.underlying);
        m.supplySPY = m.totalBalances == 0 ? 0 : m.borrowSPY * m.totalBorrows / m.totalBalances;

        m.borrowAPY = RPow.rpow(m.borrowSPY + 1e27, 86400*365, 10**27) - 1e27;
        m.supplyAPY = RPow.rpow(m.supplySPY + 1e27, 86400*365, 10**27) - 1e27;

        (m.twap, m.twapPeriod, m.currPrice) = execProxy.getPriceFull(m.underlying);

        if (q.account == address(0)) return;

        m.underlyingBalance = IERC20(m.underlying).balanceOf(q.account);
        m.eTokenBalance = IERC20(m.eTokenAddr).balanceOf(q.account);
        m.eTokenBalanceUnderlying = IEToken(m.eTokenAddr).balanceOfUnderlying(q.account);
        m.dTokenBalance = IERC20(m.dTokenAddr).balanceOf(q.account);
        m.eulerAllowance = IERC20(m.underlying).allowance(q.account, q.eulerContract);
    }
}
