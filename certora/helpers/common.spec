// getters for each of the storage functions 
// structs used in storage

methods {
    reentrancyLock() returns (uint) => DISPATCHER(true)
    upgradeAdmin() returns (address) => DISPATCHER(true)
    governorAdmin() returns (address) => DISPATCHER(true)

    moduleLookup(uint) returns (address) => DISPATCHER(true)
    proxyLookup(uint) returns (address) => DISPATCHER(true)

    trustedSenders(address) returns (TrustedSenderInfo) => DISPATCHER(true)

    accountLookup(address) returns (AccountStorage) => DISPATCHER(true)
    marketsEntered(address) returns (address[]) => DISPATCHER(true)

    underlyingLookup(address) returns (AssetConfig) => DISPATCHER(true)
    eTokenLookup(address) returns (AssetStorage) => DISPATCHER(true)
    internal dTokenLookup(address) returns (address) => DISPATCHER(true)
    internal pTokenLookup(address) returns (address) => DISPATCHER(true)
}

struct AccountStorage {
    // 1 + 5 + 4 + 20 = 30
    bool liquidityCheckInProgress;
    uint40 lastAverageLiquidityUpdate;
    uint32 numMarketsEntered;
    address firstMarketEntered;

    uint averageLiquidity;
}

struct AssetStorage {
    // Packed Slot: 5 + 1 + 4 + 12 + 4 + 2 + 4 = 32
    uint40 lastInterestAccumulatorUpdate;
    uint8 underlyingDecimals; // Not dynamic, but put here to live in same storage slot
    uint32 interestRateModel;
    int96 interestRate;
    uint32 reserveFee;
    uint16 pricingType;
    uint32 pricingParameters;

    address underlying;
    uint96 reserveBalance;

    address dTokenAddress;

    uint112 totalBalances;
    uint144 totalBorrows;

    uint interestAccumulator;

    mapping(address => UserAsset) users;

    mapping(address => mapping(address => uint)) eTokenAllowance;
    mapping(address => mapping(address => uint)) dTokenAllowance;
}

struct AssetConfig {
    // 20 + 1 + 4 + 4 + 3 = 32
    address eTokenAddress;
    bool borrowIsolated;
    uint32 collateralFactor;
    uint32 borrowFactor;
    uint24 twapWindow;
}

struct TrustedSenderInfo {
    uint32 moduleId; // 0 = un-trusted
    address moduleImpl; // only non-zero for external single-proxy modules
}

struct UserAsset {
    uint112 balance;
    uint144 owed;

    uint interestAccumulator;
}