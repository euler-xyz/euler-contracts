import "../helpers/erc20.spec"

methods {
    // asset storage getters ///////////////////////////////////////////////////////
    et_lastInterestAccumulatorUpdate (address eToken)          returns uint40  envfree
    et_underlyingDecimals            (address eToken)          returns uint8   envfree
    et_interestRateModel             (address eToken)          returns uint32  envfree
    et_interestRate                  (address eToken)          returns uint96  envfree
    et_reserveFee                    (address eToken)          returns uint32  envfree
    et_pricingType                   (address eToken)          returns uint16  envfree
    et_pricingParameters             (address eToken)          returns uint32  envfree
    et_underlying                    (address eToken)          returns address envfree
    et_reserveBalance                (address eToken)          returns uint96  envfree
    et_dTokenAddress                 (address eToken)          returns address envfree
    et_totalBalances                 (address eToken)          returns uint112 envfree
    et_totalBorrows                  (address eToken)          returns uint144 envfree
    et_interestAccumulator           (address eToken)          returns uint    envfree
    et_user_balance             (address eToken, address user) returns uint112 envfree
    et_user_owed                (address eToken, address user) returns uint144 envfree
    et_user_interestAccumulator (address eToken, address user) returns uint    envfree
    et_eTokenAllowance (address eToken, address a, address b)  returns uint    envfree
    et_dTokenAllowance (address eToken, address a, address b)  returns uint    envfree
    underlying_eTokenAddress (address)                         returns address envfree
    ERCBalanceOf (address, address)                            returns uint    envfree
    ERCTransfer (address, address, uint)                                       envfree

    computeNewAverageLiquidity(address,uint) => NONDET
    computeUtilisation(uint,uint)            => NONDET
    _computeExchangeRate(uint,uint,uint)     => NONDET


    // Storage.sol state variable getters
    // reentrancyLock()                returns (uint)                                      envfree
    // upgradeAdmin()                  returns (address)                                   envfree
    // governorAdmin()                 returns (address)                                   envfree

    // moduleLookup(uint)              returns (address)                                   envfree
    // proxyLookup(uint)               returns (address)                                   envfree

    // trustedSenders(address)         returns (uint32, address)                           envfree // returns TrustedSenderInfo

    // accountLookup(address)          returns (bool, uint40, uint32, address, uint)       envfree // returns AccountStorage
    // marketsEntered(address)         returns (address[])                                 envfree

    underlyingLookup(address)       returns (address, bool, uint32, uint32, uint24)     envfree // returns AssetConfig
    dTokenLookup(address)           returns (address)                                   envfree
    pTokenLookup(address)           returns (address)                                   envfree
    reversePTokenLookup(address)    returns (address)                                   envfree
}


rule sanity(method f) { 
    env e; calldataarg args;

    f(e,args);

    assert false,
        "this should fail";
}

