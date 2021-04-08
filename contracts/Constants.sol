// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

abstract contract Constants {
    uint internal constant MAX_SANE_TOKEN_AMOUNT = type(uint112).max;
    uint internal constant INTERNAL_DEBT_PRECISION = 1e9;
    uint internal constant MAX_ENTERED_MARKETS = 10; // per sub-account
    uint internal constant MAX_POSSIBLE_ENTERED_MARKETS = 2**32; // limited by size of AccountStorage.numMarketsEntered
    uint internal constant CONFIG_FACTOR_SCALE = 4_000_000_000; // must fit into a uint32
    uint internal constant INITIAL_INTEREST_ACCUMULATOR = 1e27;

    uint internal constant POST_LIQUIDATION_TARGET_HEALTH = 1.2 * 1e18;
    uint internal constant LIQUIDATION_DISCOUNT_COLLATERAL_PROVIDER = 0.005 * 1e18;
    uint internal constant LIQUIDATION_DISCOUNT_UNDERLYING_PROVIDER = 0.0075 * 1e18;
    uint internal constant MAXIMUM_DISCOUNT = 0.2 * 1e18;


    // Pricing types

    uint16 internal constant PRICINGTYPE_PEGGED = 1;
    uint16 internal constant PRICINGTYPE_UNISWAP3_TWAP = 2;


    // Modules

    // Public single-proxy modules
    uint internal constant MODULEID__INSTALLER = 1;
    uint internal constant MODULEID__MARKETS = 2;
    uint internal constant MODULEID__LIQUIDATION = 3;
    uint internal constant MODULEID__GOVERNANCE = 4;
    uint internal constant MODULEID__EXEC = 5;

    uint internal constant MAX_EXTERNAL_SINGLE_PROXY_MODULEID = 499_999;

    // Public multi-proxy modules
    uint internal constant MODULEID__ETOKEN = 500_000;
    uint internal constant MODULEID__DTOKEN = 500_001;

    uint internal constant MAX_EXTERNAL_MODULEID = 999_999;

    // Internal modules
    uint internal constant MODULEID__RISK_MANAGER = 1_000_000;

    // Interest rate models
    uint internal constant MODULEID__IRM_ZERO = 2_000_000;
    uint internal constant MODULEID__IRM_FIXED = 2_000_001;
    uint internal constant MODULEID__IRM_LINEAR = 2_000_100;
    uint internal constant MODULEID__IRM_LINEAR_RECURSIVE = 2_000_101;
}
