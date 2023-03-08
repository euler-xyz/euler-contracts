// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

// Config for chain ID 1 - Ethereum Mainnet
abstract contract Config {
    uint internal constant MAX_ENTERED_MARKETS = 10; // per sub-account
    uint internal constant MAX_POSSIBLE_ENTERED_MARKETS = 2**32; // limited by size of AccountStorage.numMarketsEntered

    uint internal constant AVERAGE_LIQUIDITY_PERIOD = 24 * 60 * 60;

    uint16 internal constant MIN_UNISWAP3_OBSERVATION_CARDINALITY = 144;
    uint24 internal constant DEFAULT_TWAP_WINDOW_SECONDS = 30 * 60;

    uint32 internal constant DEFAULT_RESERVE_FEE = uint32(0.23 * 4_000_000_000);
    uint32 internal constant DEFAULT_BORROW_FACTOR = uint32(0.28 * 4_000_000_000);
    uint32 internal constant SELF_COLLATERAL_FACTOR = uint32(0.95 * 4_000_000_000);

    // Liquidation

    // How much of a liquidation is credited to the underlying's reserves.
    uint public constant UNDERLYING_RESERVES_FEE = 0.02 * 1e18;

    // Maximum discount that can be awarded under any conditions.
    uint public constant MAXIMUM_DISCOUNT = 0.20 * 1e18;

    // How much faster the booster grows for a fully funded supplier. Partially-funded suppliers
    // have this scaled proportional to their free-liquidity divided by the violator's liability.
    uint public constant DISCOUNT_BOOSTER_SLOPE = 2 * 1e18;

    // How much booster discount can be awarded beyond the base discount.
    uint public constant MAXIMUM_BOOSTER_DISCOUNT = 0.025 * 1e18;

    // Post-liquidation target health score that limits maximum liquidation sizes. Must be >= 1.
    uint public constant TARGET_HEALTH = 1.25 * 1e18;
}