// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./Constants.sol";

abstract contract Storage is Constants {
    // Dispatcher and upgrades

    uint reentrancyLock;

    address upgradeAdmin;
    address governorAdmin;

    mapping(uint => address) moduleLookup; // moduleId => module implementation
    mapping(uint => address) proxyLookup; // moduleId => proxy address (only for single-proxy modules)

    struct TrustedSenderInfo {
        uint32 moduleId; // 0 = un-trusted
        address moduleImpl; // only non-zero for external single-proxy modules
    }

    mapping(address => TrustedSenderInfo) trustedSenders; // sender address => moduleId (0 = un-trusted)



    // Account-level state
    // Sub-accounts are considered distinct accounts

    struct AccountStorage {
        // 1 + 5 + 4 + 20 = 30
        bool liquidityCheckInProgress;
        uint40 lastActivity;
        uint32 numMarketsEntered;
        address firstMarketEntered;
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

    struct UserAsset {
        uint112 balance;
        uint144 owed;

        uint interestAccumulator;
    }

    struct AssetStorage {
        // Packed Slot: 5 + 1 + 4 + 12 + 4 + 2 + 4 = 32
        uint40 lastInterestAccumulatorUpdate;
        uint8 underlyingDecimals; // Not dynamic, but put here to live in same storage slot
        uint32 interestRateModel;
        int96 interestRate;
        uint32 prevUtilisation;
        uint16 pricingType;
        uint32 pricingParameters;

        address underlying;
        address dTokenAddress;

        uint112 totalBalances;
        uint144 totalBorrows;

        uint interestAccumulator;

        mapping(address => UserAsset) users;

        mapping(address => mapping(address => uint)) eTokenAllowance;
        mapping(address => mapping(address => uint)) dTokenAllowance;
    }

    mapping(address => AssetConfig) internal underlyingLookup; // underlying => AssetConfig
    mapping(address => AssetStorage) internal eTokenLookup; // EToken => AssetStorage
    mapping(address => address) internal dTokenLookup; // DToken => EToken
}
