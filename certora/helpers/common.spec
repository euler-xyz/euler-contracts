methods {
    reentrancyLock() returns (uint) => DISPATCHER(true)
    upgradeAdmin() returns (address) => DISPATCHER(true)
    governorAdmin() returns (address) => DISPATCHER(true)

    moduleLookup(uint) returns (address) => DISPATCHER(true)
    proxyLookup(uint) returns (address) => DISPATCHER(true)

    trustedSenders(address) returns (uint32, address) => DISPATCHER(true) // returns TrustedSenderInfo

    accountLookup(address) returns (bool, uint40, uint32, address, uint) => DISPATCHER(true) // returns AccountStorage
    marketsEntered(address) returns (address[]) => DISPATCHER(true)

    underlyingLookup(address) returns (address, bool, uint32, uint32, uint24) => DISPATCHER(true) // returns AssetConfig
    eTokenLookup(address) returns (uint40, uint8, int96,
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
        mapping(address => mapping(address => uint)) dTokenAllowance;) => DISPATCHER(true) // returns AssetStorage
    dTokenLookup(address) returns (address) => DISPATCHER(true)
    pTokenLookup(address) returns (address) => DISPATCHER(true)
}

