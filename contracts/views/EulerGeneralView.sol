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
import "../BaseIRMLinearKink.sol";



contract EulerGeneralView is Constants {
    bytes32 immutable public moduleGitCommit;

    constructor(bytes32 moduleGitCommit_) {
        moduleGitCommit = moduleGitCommit_;
    }

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
        uint borrowAPY;
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

        {
            uint borrowSPY = uint(int(marketsProxy.interestRate(m.underlying)));
            (m.borrowAPY, m.supplyAPY) = computeAPYs(borrowSPY, m.totalBorrows, m.totalBalances, m.reserveFee);
        }

        (m.twap, m.twapPeriod, m.currPrice) = execProxy.getPriceFull(m.underlying);
        (m.pricingType, m.pricingParameters, m.pricingForwarded) = marketsProxy.getPricingConfig(m.underlying);

        if (q.account == address(0)) return;

        m.underlyingBalance = IERC20(m.underlying).balanceOf(q.account);
        m.eTokenBalance = IERC20(m.eTokenAddr).balanceOf(q.account);
        m.eTokenBalanceUnderlying = EToken(m.eTokenAddr).balanceOfUnderlying(q.account);
        m.dTokenBalance = IERC20(m.dTokenAddr).balanceOf(q.account);
        m.eulerAllowance = IERC20(m.underlying).allowance(q.account, q.eulerContract);
    }


    function computeAPYs(uint borrowSPY, uint totalBorrows, uint totalBalancesUnderlying, uint32 reserveFee) public pure returns (uint borrowAPY, uint supplyAPY) {
        borrowAPY = RPow.rpow(borrowSPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;
        supplyAPY = totalBalancesUnderlying == 0 ? 0 : borrowAPY * totalBorrows / totalBalancesUnderlying;
        supplyAPY = supplyAPY * (RESERVE_FEE_SCALE - reserveFee) / RESERVE_FEE_SCALE;
    }



    // Interest rate model queries

    struct QueryIRM {
        address eulerContract;
        address underlying;
    }

    struct ResponseIRM {
        uint kink;

        uint baseAPY;
        uint kinkAPY;
        uint maxAPY;

        uint baseSupplyAPY;
        uint kinkSupplyAPY;
        uint maxSupplyAPY;
    }

    function doQueryIRM(QueryIRM memory q) external view returns (ResponseIRM memory r) {
        Euler eulerProxy = Euler(q.eulerContract);
        Markets marketsProxy = Markets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));

        uint moduleId = marketsProxy.interestRateModel(q.underlying);
        address moduleImpl = eulerProxy.moduleIdToImplementation(moduleId);

        BaseIRMLinearKink irm = BaseIRMLinearKink(moduleImpl);

        uint kink = r.kink = irm.kink();
        uint32 reserveFee = marketsProxy.reserveFee(q.underlying);

        uint baseSPY = irm.baseRate();
        uint kinkSPY = baseSPY + (kink * irm.slope1());
        uint maxSPY = kinkSPY + ((type(uint32).max - kink) * irm.slope2());

        (r.baseAPY, r.baseSupplyAPY) = computeAPYs(baseSPY, 0, type(uint32).max, reserveFee);
        (r.kinkAPY, r.kinkSupplyAPY) = computeAPYs(kinkSPY, kink, type(uint32).max, reserveFee);
        (r.maxAPY, r.maxSupplyAPY) = computeAPYs(maxSPY, type(uint32).max, type(uint32).max, reserveFee);
    }
}
