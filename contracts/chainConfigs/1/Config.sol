// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

// Config for chain ID 1 - Ethereum Mainnet
abstract contract Config {
    uint internal constant MAX_ENTERED_MARKETS = 10; // per sub-account

    uint internal constant AVERAGE_LIQUIDITY_PERIOD = 24 * 60 * 60;

    uint16 internal constant MIN_UNISWAP3_OBSERVATION_CARDINALITY = 144;
    uint24 internal constant DEFAULT_TWAP_WINDOW_SECONDS = 30 * 60;

    uint32 internal constant DEFAULT_RESERVE_FEE = uint32(0.23 * 4_000_000_000);
    uint32 internal constant DEFAULT_BORROW_FACTOR = uint32(0.28 * 4_000_000_000);
    uint32 internal constant SELF_COLLATERAL_FACTOR = uint32(0.95 * 4_000_000_000);

    // Liquidation

    uint internal constant UNDERLYING_RESERVES_FEE_CONFIG = 0.02 * 1e18;
    uint internal constant MAXIMUM_DISCOUNT_CONFIG = 0.20 * 1e18;
    uint internal constant DISCOUNT_BOOSTER_SLOPE_CONFIG = 2 * 1e18;
    uint internal constant MAXIMUM_BOOSTER_DISCOUNT_CONFIG = 0.025 * 1e18;
    uint internal constant TARGET_HEALTH_CONFIG = 1.25 * 1e18;
}
