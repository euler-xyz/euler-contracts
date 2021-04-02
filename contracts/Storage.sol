// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Constants.sol";

abstract contract Storage is Constants {
    // Dispatcher and upgrades

    uint notEntered;

    address upgradeAdmin;
    address governorAdmin;

    // FIXME: re-think names for these...
    mapping(uint => address) moduleLookup; // moduleId => module implementation
    mapping(uint => address) proxyLookup; // moduleId => proxy address (only for single-proxy modules)
    mapping(address => uint) trustedSenders; // sender address => moduleId (0 = un-trusted)



    // Account-level state
    // Sub-accounts are considered distinct accounts

    struct AccountStorage {
        bool liquidityCheckInProgress;
        uint32 numMarketsEntered;
    }

    mapping(address => AccountStorage) accountLookup;
    mapping(address => address[MAX_POSSIBLE_ENTERED_MARKETS]) marketsEntered;



    // Markets and assets

    struct AssetConfig {
        // 20 + 1 + 4 + 4 + 3 = 32
        address eTokenAddress;
        bool borrowIsolated;
        uint32 collateralFactor;
        uint32 borrowFactor;
        uint24 twapWindow;
    }

    struct UserBorrow {
        uint owed;
        uint interestAccumulator;
    }

    struct AssetStorage {
        address underlying;
        address eTokenAddress;
        address dTokenAddress;

        uint112 totalBalances;
        uint112 totalBorrows;
        uint interestAccumulator;

        uint16 pricingType;
        bytes12 pricingParameters;

        // Packed Slot: 5 + 1 + 4 + 12 + 4 = 26
        uint40 lastInterestAccumulatorUpdate;
        uint8 underlyingDecimals; // Not dynamic, but put here to live in same storage slot
        uint32 interestRateModel;
        int96 interestRate;
        uint32 prevUtilisation;

        mapping(address => uint) balances;
        mapping(address => UserBorrow) borrows;

        mapping(address => mapping(address => uint)) eTokenAllowance;
        mapping(address => mapping(address => uint)) dTokenAllowance;
    }

    mapping(address => AssetConfig) internal underlyingLookup; // underlying => AssetConfig
    mapping(address => AssetStorage) internal eTokenLookup; // EToken => AssetStorage
    mapping(address => address) internal dTokenLookup; // DToken => EToken
}
