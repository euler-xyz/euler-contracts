// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Constants.sol";
import "../Storage.sol";
import "../vendor/RPow.sol";
import "../Euler.sol";
import "../modules/Markets.sol";
import "../modules/EToken.sol";
import "../modules/Exec.sol";
import "../IRiskManager.sol";



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
        address pTokenAddr;

        Storage.AssetConfig config;

        uint poolSize;
        uint totalBalances;
        uint totalBorrows;
        uint reserveBalance;

        uint32 reserveFee;
        uint borrowSPY;
        uint borrowAPR;
        uint borrowAPY;
        uint supplySPY;
        uint supplyAPR;
        uint supplyAPY;

        // Pricing

        uint twap;
        uint twapPeriod;
        uint currPrice;
        uint16 pricingType;
        uint32 pricingParameters;
        address pricingForwarded;

        // Account specific

        uint underlyingBalance;
        uint eulerAllowance;
        uint eTokenBalance;
        uint eTokenBalanceUnderlying;
        uint dTokenBalance;
        IRiskManager.LiquidityStatus liquidityStatus;
    }

    struct Response {
        uint timestamp;
        uint blockNumber;

        ResponseMarket[] markets;
        address[] enteredMarkets;
        uint averageLiquidity;
        address averageLiquidityDelegate;
    }



    // Implementation

    function doQueryBatch(Query[] memory qs) external returns (Response[] memory r) {
        r = new Response[](qs.length);

        for (uint i = 0; i < qs.length; ++i) {
            r[i] = doQuery(qs[i]);
        }
    }

    function doQuery(Query memory q) public returns (Response memory r) {
        r.timestamp = block.timestamp;
        r.blockNumber = block.number;

        Euler eulerProxy = Euler(q.eulerContract);

        Markets marketsProxy = Markets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));
        Exec execProxy = Exec(eulerProxy.moduleIdToProxy(MODULEID__EXEC));

        IRiskManager.AssetLiquidity[] memory liqs;

        if (q.account != address(0)) {
            liqs = execProxy.detailedLiquidity(q.account);
        }

        r.markets = new ResponseMarket[](liqs.length + q.markets.length);

        for (uint i = 0; i < liqs.length; ++i) {
            ResponseMarket memory m = r.markets[i];

            m.underlying = liqs[i].underlying;
            m.liquidityStatus = liqs[i].status;

            populateResponseMarket(q, m, marketsProxy, execProxy);
        }

        for (uint j = liqs.length; j < liqs.length + q.markets.length; ++j) {
            uint i = j - liqs.length;
            ResponseMarket memory m = r.markets[j];

            m.underlying = q.markets[i];

            populateResponseMarket(q, m, marketsProxy, execProxy);
        }

        if (q.account != address(0)) {
            r.enteredMarkets = marketsProxy.getEnteredMarkets(q.account);
            r.averageLiquidity = execProxy.getAverageLiquidity(q.account);
            r.averageLiquidityDelegate = execProxy.getAverageLiquidityDelegateAccount(q.account);
        }
    }

    function populateResponseMarket(Query memory q, ResponseMarket memory m, Markets marketsProxy, Exec execProxy) private {
        m.name = IERC20(m.underlying).name();
        m.symbol = IERC20(m.underlying).symbol();
        m.decimals = IERC20(m.underlying).decimals();

        m.eTokenAddr = marketsProxy.underlyingToEToken(m.underlying);
        if (m.eTokenAddr == address(0)) return; // not activated

        m.dTokenAddr = marketsProxy.eTokenToDToken(m.eTokenAddr);
        m.pTokenAddr = marketsProxy.underlyingToPToken(m.underlying);

        {
            Storage.AssetConfig memory c = marketsProxy.underlyingToAssetConfig(m.underlying);
            m.config = c;
        }

        m.poolSize = IERC20(m.underlying).balanceOf(q.eulerContract);
        m.totalBalances = EToken(m.eTokenAddr).totalSupplyUnderlying();
        m.totalBorrows = IERC20(m.dTokenAddr).totalSupply();
        m.reserveBalance = EToken(m.eTokenAddr).reserveBalanceUnderlying();

        m.reserveFee = marketsProxy.reserveFee(m.underlying);

        m.borrowSPY = uint(int(marketsProxy.interestRate(m.underlying)));
        m.supplySPY = m.totalBalances == 0 ? 0 : m.borrowSPY * m.totalBorrows / m.totalBalances;

        m.supplySPY = m.supplySPY * (RESERVE_FEE_SCALE - m.reserveFee) / RESERVE_FEE_SCALE;

        m.borrowAPR = m.borrowSPY * SECONDS_PER_YEAR;
        m.supplyAPR = m.supplySPY * SECONDS_PER_YEAR;

        m.borrowAPY = RPow.rpow(m.borrowSPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;
        m.supplyAPY = RPow.rpow(m.supplySPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;

        (m.twap, m.twapPeriod, m.currPrice) = execProxy.getPriceFull(m.underlying);
        (m.pricingType, m.pricingParameters, m.pricingForwarded) = marketsProxy.getPricingConfig(m.underlying);

        if (q.account == address(0)) return;

        m.underlyingBalance = IERC20(m.underlying).balanceOf(q.account);
        m.eTokenBalance = IERC20(m.eTokenAddr).balanceOf(q.account);
        m.eTokenBalanceUnderlying = EToken(m.eTokenAddr).balanceOfUnderlying(q.account);
        m.dTokenBalance = IERC20(m.dTokenAddr).balanceOf(q.account);
        m.eulerAllowance = IERC20(m.underlying).allowance(q.account, q.eulerContract);
    }
}
