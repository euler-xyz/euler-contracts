// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Euler.sol";
import "../Storage.sol";
import "../modules/EToken.sol";
import "../modules/Markets.sol";
import "../BaseIRMLinearKink.sol";
import "../vendor/RPow.sol";

interface IExec {
    function getPriceFull(address underlying) external view returns (uint twap, uint twapPeriod, uint currPrice);
    function getPrice(address underlying) external view returns (uint twap, uint twapPeriod);
    function detailedLiquidity(address account) external view returns (IRiskManager.AssetLiquidity[] memory assets);
    function liquidity(address account) external view returns (IRiskManager.LiquidityStatus memory status);
}

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
    }



    // Implementation

    function doQueryBatch(Query[] memory qs) external view returns (Response[] memory r) {
        r = new Response[](qs.length);

        for (uint i = 0; i < qs.length; ++i) {
            r[i] = doQuery(qs[i]);
        }
    }

    function doQuery(Query memory q) public view returns (Response memory r) {
        r.timestamp = block.timestamp;
        r.blockNumber = block.number;

        Euler eulerProxy = Euler(q.eulerContract);

        Markets marketsProxy = Markets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));
        IExec execProxy = IExec(eulerProxy.moduleIdToProxy(MODULEID__EXEC));

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
        }
    }

    function populateResponseMarket(Query memory q, ResponseMarket memory m, Markets marketsProxy, IExec execProxy) private view {
        m.name = getStringOrBytes32(m.underlying, IERC20.name.selector);
        m.symbol = getStringOrBytes32(m.underlying, IERC20.symbol.selector);

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

        uint supplySPY = totalBalancesUnderlying == 0 ? 0 : borrowSPY * totalBorrows / totalBalancesUnderlying;
        supplySPY = supplySPY * (RESERVE_FEE_SCALE - reserveFee) / RESERVE_FEE_SCALE;
        supplyAPY = RPow.rpow(supplySPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;
    }


    // works only for markets with kink IRM configured
    function computeSPY(address eulerContract, address underlying, uint totalBorrows, uint totalBalancesUnderlying) public view returns (uint borrowSPY) {
        BaseIRMLinearKink irm = BaseIRMLinearKink(getIRMImplementation(eulerContract, underlying));

        uint32 utilisation;
        if (totalBalancesUnderlying == 0) utilisation = 0; // empty pool arbitrarily given utilisation of 0
        else utilisation = uint32(totalBorrows * (uint(type(uint32).max) * 1e18) / totalBalancesUnderlying / 1e18);

        uint kink = irm.kink();
        uint slope1 = irm.slope1();
        uint slope2 = irm.slope2();

        borrowSPY = irm.baseRate();
        if (utilisation <= kink) {
            borrowSPY += utilisation * slope1;
        } else {
            borrowSPY += kink * slope1;
            borrowSPY += slope2 * (utilisation - kink);
        }
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

    struct ResponseIRMFull {
        uint kink;
        DataPointIRM[] dataPoints;
    }

    struct DataPointIRM {
        uint utilisation;
        uint borrowAPY;
        uint supplyAPY;
    }

    function doQueryIRM(QueryIRM memory q) external view returns (ResponseIRM memory r) {
        BaseIRMLinearKink irm = BaseIRMLinearKink(getIRMImplementation(q.eulerContract, q.underlying));
        uint kink = r.kink = irm.kink();
        uint baseSPY = irm.baseRate();
        uint kinkSPY = baseSPY + (kink * irm.slope1());
        uint maxSPY = kinkSPY + ((type(uint32).max - kink) * irm.slope2());

        Markets marketsProxy = Markets(Euler(q.eulerContract).moduleIdToProxy(MODULEID__MARKETS));
        uint32 reserveFee = marketsProxy.reserveFee(q.underlying);

        (r.baseAPY, r.baseSupplyAPY) = computeAPYs(baseSPY, 0, type(uint32).max, reserveFee);
        (r.kinkAPY, r.kinkSupplyAPY) = computeAPYs(kinkSPY, kink, type(uint32).max, reserveFee);
        (r.maxAPY, r.maxSupplyAPY) = computeAPYs(maxSPY, type(uint32).max, type(uint32).max, reserveFee);
    }

    function doQueryIRMFull(QueryIRM memory q) external view returns (ResponseIRMFull memory r) {
        uint preKinkIncrements = 14;
        uint postKinkIncrements = 5;

        Markets marketsProxy = Markets(Euler(q.eulerContract).moduleIdToProxy(MODULEID__MARKETS));
        BaseIRMLinearKink irm = BaseIRMLinearKink(getIRMImplementation(q.eulerContract, q.underlying));
        
        uint32 reserveFee = marketsProxy.reserveFee(q.underlying);
        
        r.kink = irm.kink();
        r.dataPoints = new DataPointIRM[](preKinkIncrements + postKinkIncrements + 1);

        uint totalBorrows = 0;
        for (uint i = 0; i < r.dataPoints.length; i++) {
            uint borrowSPY = computeSPY(q.eulerContract, q.underlying, totalBorrows, type(uint32).max);
            (uint borrowAPY, uint supplyAPY) = computeAPYs(borrowSPY, totalBorrows, type(uint32).max, reserveFee);

            r.dataPoints[i] = (DataPointIRM({
                utilisation: totalBorrows * (uint(type(uint32).max) * 1e18) / type(uint32).max / 1e18,
                borrowAPY: borrowAPY,
                supplyAPY: supplyAPY
            }));

            if (i < preKinkIncrements - 1) {
                totalBorrows += (type(uint32).max - r.kink) / preKinkIncrements;
            } else if (i == preKinkIncrements - 1) {
                totalBorrows = r.kink;
            } else if (i < preKinkIncrements + postKinkIncrements - 1) {
                totalBorrows += r.kink / postKinkIncrements;
            } else {
                totalBorrows = type(uint32).max;
            }
        }
    }



    // AccountLiquidity queries

    struct ResponseAccountLiquidity {
        IRiskManager.AssetLiquidity[] markets;
    }

    function doQueryAccountLiquidity(address eulerContract, address[] memory addrs) external view returns (ResponseAccountLiquidity[] memory r) {
        Euler eulerProxy = Euler(eulerContract);
        IExec execProxy = IExec(eulerProxy.moduleIdToProxy(MODULEID__EXEC));

        r = new ResponseAccountLiquidity[](addrs.length);

        for (uint i = 0; i < addrs.length; ++i) {
            r[i].markets = execProxy.detailedLiquidity(addrs[i]);
        }
    }



    // For tokens like MKR which return bytes32 on name() or symbol()

    function getStringOrBytes32(address contractAddress, bytes4 selector) private view returns (string memory) {
        (bool success, bytes memory result) = contractAddress.staticcall(abi.encodeWithSelector(selector));
        if (!success) return "";

        return result.length == 32 ? string(abi.encodePacked(result)) : abi.decode(result, (string));
    }

    function getIRMImplementation(address eulerContract, address underlying) private view returns (address) {
        Euler eulerProxy = Euler(eulerContract);
        Markets marketsProxy = Markets(eulerProxy.moduleIdToProxy(MODULEID__MARKETS));

        uint moduleId = marketsProxy.interestRateModel(underlying);
        return eulerProxy.moduleIdToImplementation(moduleId);
    }
}
