// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../Euler.sol";
import "../modules/EToken.sol";
import "../modules/Markets.sol";
import "../modules/Exec.sol";
import "../BaseIRMLinearKink.sol";
import "../IRiskManager.sol";
import "../Storage.sol";

interface IExec {
    function getPriceFull(address underlying) external view returns (uint twap, uint twapPeriod, uint currPrice);
    function liquidity(address account) external view returns (IRiskManager.LiquidityStatus memory status);
}

contract EulerSimpleLens is Constants {

    bytes32 immutable public moduleGitCommit;
    Euler immutable public euler;
    Markets immutable public markets;
    Exec immutable public exec;

    struct ResponseIRM {
        uint kink;

        uint baseAPY;
        uint kinkAPY;
        uint maxAPY;

        uint baseSupplyAPY;
        uint kinkSupplyAPY;
        uint maxSupplyAPY;
    }
    
    constructor(bytes32 moduleGitCommit_, address euler_) {
        moduleGitCommit = moduleGitCommit_;

        euler = Euler(euler_);
        markets = Markets(euler.moduleIdToProxy(MODULEID__MARKETS));
        exec = Exec(euler.moduleIdToProxy(MODULEID__EXEC));
    }

    // underlying -> etoken
    function underlyingToEToken(address underlying) public view returns (address eToken) {
        eToken = markets.underlyingToEToken(underlying);
    }

    // underlying -> dtoken
    function underlyingToDToken(address underlying) public view returns (address dToken) {
        dToken = markets.underlyingToDToken(underlying);
    }

    // underlying -> ptoken
    function underlyingToPToken(address underlying) public view returns (address pToken) {
        pToken = markets.underlyingToPToken(underlying);
    }

    // underlying -> etoken, dtoken and ptoken
    function underlyingToInternalTokens(address underlying) public view returns (address eToken, address dToken, address pToken) {
        eToken = underlyingToEToken(underlying);
        dToken = underlyingToDToken(underlying);
        pToken = underlyingToPToken(underlying);
    }

    // underlying -> asset configs
    function underlyingToAssetConfig(address underlying) external view returns (Storage.AssetConfig memory config) {
        config = markets.underlyingToAssetConfig(underlying);
    }

    // underlying -> interest rate model
    function interestRateModel(address underlying) external view returns (uint) {
        return markets.interestRateModel(underlying);
    }

    // underlying -> interest rate
    function interestRates(address underlying) external view returns (uint borrowSPY, uint borrowAPY, uint supplyAPY) {
        borrowSPY = uint(int(markets.interestRate(underlying)));
        ( , uint totalBalances, uint totalBorrows, ) = getTotalSupplyAndDebts(underlying);
        (borrowAPY, supplyAPY) = computeAPYs(borrowSPY, totalBorrows, totalBalances, reserveFee(underlying));
    }

    // underlying -> interest accumulator
    function interestAccumulator(address underlying) external view returns (uint) {
        return markets.interestAccumulator(underlying);
    }

    // underlying -> reserve fee
    function reserveFee(address underlying) public view returns (uint32) {
        return markets.reserveFee(underlying);
    }

    // underlying -> pricing configs
    function getPricingConfig(address underlying) external view returns (uint16 pricingType, uint32 pricingParameters, address pricingForwarded) {
        (pricingType, pricingParameters, pricingForwarded) = markets.getPricingConfig(underlying);
    }

    // entered markets
    function getEnteredMarkets(address account) external view returns (address[] memory) {
        return markets.getEnteredMarkets(account);
    }

    // liability, collateral, health score
    function getAccountStatus(address account) external view returns (uint collateralValue, uint liabilityValue, uint healthScore) {
        IExec _exec = IExec(address(exec));
        IRiskManager.LiquidityStatus memory status = _exec.liquidity(account);

        collateralValue = status.collateralValue;
        liabilityValue = status.liabilityValue;

        healthScore = liabilityValue == 0? type(uint256).max : collateralValue * 1e18 / liabilityValue;
    } 

    // prices
    function getPriceFull(address underlying) external view returns (uint twap, uint twapPeriod, uint currPrice) {
        IExec _exec = IExec(address(exec));
        (twap, twapPeriod, currPrice) = _exec.getPriceFull(underlying);
    }

    // Balance of an account's wrapped tokens
    function getPTokenBalance(address underlying, address account) external view returns (uint256) {
        address pTokenAddr = underlyingToPToken(underlying); 
        return IERC20(pTokenAddr).balanceOf(account);
    }

    // Debt owed by a particular account, in underlying units
    function getDTokenBalance(address underlying, address account) external view returns (uint256) {
        address dTokenAddr = underlyingToDToken(underlying);
        return IERC20(dTokenAddr).balanceOf(account);
    }

    // Balance of a particular account, in underlying units (increases as interest is earned)
    function getETokenBalance(address underlying, address account) external view returns (uint256) {
        address eTokenAddr = underlyingToEToken(underlying);
        return EToken(eTokenAddr).balanceOfUnderlying(account);
    }

    // approvals
    function getEulerAccountAllowance(address underlying, address account) external view returns (uint256) {
        return IERC20(underlying).allowance(account, address(euler));
    }

    // total supply, total debts
    function getTotalSupplyAndDebts(address underlying) public view returns (uint poolSize, uint totalBalances, uint totalBorrows, uint reserveBalance) {
        poolSize = IERC20(underlying).balanceOf(address(euler));
        (address eTokenAddr, address dTokenAddr, ) = underlyingToInternalTokens(underlying);
        totalBalances = EToken(eTokenAddr).totalSupplyUnderlying();
        totalBorrows = IERC20(dTokenAddr).totalSupply();
        reserveBalance = EToken(eTokenAddr).reserveBalanceUnderlying();
    }

    // token name and symbol
    function getTokenInfo(address underlying) external view returns (string memory name, string memory symbol) {
        name = getStringOrBytes32(underlying, IERC20.name.selector);
        symbol = getStringOrBytes32(underlying, IERC20.symbol.selector);
    }

    // For tokens like MKR which return bytes32 on name() or symbol()
    function getStringOrBytes32(address contractAddress, bytes4 selector) private view returns (string memory) {
        (bool success, bytes memory result) = contractAddress.staticcall(abi.encodeWithSelector(selector));
        if (!success || result.length < 32) return "";

        return result.length == 32 ? string(abi.encodePacked(result)) : abi.decode(result, (string));
    }

    // interest rates as APYs
    function irmSettings(address underlying) external view returns (ResponseIRM memory r) {
        uint moduleId = markets.interestRateModel(underlying);
        address moduleImpl = euler.moduleIdToImplementation(moduleId);

        BaseIRMLinearKink irm = BaseIRMLinearKink(moduleImpl);

        uint kink = r.kink = irm.kink();
        uint32 _reserveFee = reserveFee(underlying);

        uint baseSPY = irm.baseRate();
        uint kinkSPY = baseSPY + (kink * irm.slope1());
        uint maxSPY = kinkSPY + ((type(uint32).max - kink) * irm.slope2());

        (r.baseAPY, r.baseSupplyAPY) = computeAPYs(baseSPY, 0, type(uint32).max, _reserveFee);
        (r.kinkAPY, r.kinkSupplyAPY) = computeAPYs(kinkSPY, kink, type(uint32).max, _reserveFee);
        (r.maxAPY, r.maxSupplyAPY) = computeAPYs(maxSPY, type(uint32).max, type(uint32).max, _reserveFee);
    }

    // compute APYs
    function computeAPYs(uint borrowSPY, uint totalBorrows, uint totalBalancesUnderlying, uint32 _reserveFee) private pure returns (uint borrowAPY, uint supplyAPY) {
        borrowAPY = RPow.rpow(borrowSPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;

        uint supplySPY = totalBalancesUnderlying == 0 ? 0 : borrowSPY * totalBorrows / totalBalancesUnderlying;
        supplySPY = supplySPY * (RESERVE_FEE_SCALE - _reserveFee) / RESERVE_FEE_SCALE;
        supplyAPY = RPow.rpow(supplySPY + 1e27, SECONDS_PER_YEAR, 10**27) - 1e27;
    }

}

