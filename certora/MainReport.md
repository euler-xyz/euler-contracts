## Description
    This contract is an amalgamation of all state variables held by the system and the corresponding invariants and rules used to verify properties of those state variables. The results and develpment of these rules and invariants is split up and maintained in 3 seperate reports


## Dispatcher and Upgrades
### Important State Variables
    reentrancyLock: set to true while and only while a function is executing

    upgradeAdmin:

    governorAdmin:

    moduleLookup:

    proxyLookup:

    trustedSenders: converts an address (of a proxy) to the moduleID and implementation

### Invariants
reentrancyLock_valid: reentrancyLock should always be false to ensure no reentrancy
    reentrancyLock == REENTRANCYLOCK__UNLOCKED

initialized => governerAdmin != 0

modules and proxies should be balanced. Every proxy in proxyLookup corresponds to a module in trusted senders
for single proxy modules
proxy_to_module && module_to_proxy:
    trustedSenders(proxy).moduleId => proxyLookup(moduleId) == proxy

proxy_to_module only for multi-proxy modules

single_proxy_bounded:
    ID > MAX_EXTERNAL_SINGLE_PROXY_MODULEID => proxyLookup(ID) == 0



### State Evolution 

once initialized, governorAdmin should not change

once initialized moduleLookup should not change
    ^ is this True


## Account-level state
### Important State Variables

accountLookup

marketsEntered

### Invariants

no_double_markets:
    address A. address B.
    A != B => marketsEntered(account)[A] != marketsEntered(account)[B]

can an account be in a closed market?

If a user has a non-zero borrow owed, then they must be entered into market
and must have a non-zero interest accumulator
    UserAsset.owed != 0 => userAsset.interestAccumulator != 0 && accountLookup(user).numMarketsEntered != 0

Account_ID_Bounded
    in any location a sub-account is used, the maximum value is 255

No proxy may be a market for an account
    proxyLookup(id) != 0 => marketsEntered(account)[market] != proxyLookup(id) 
        forall address account. forall address market.
    ^ realistically we would have to this through a reverse lookup of some kind through either a ghost or harness

## Markets and Assets
### Important State Variables

:::info
    Note: Each of these tables are for information about TYPES (implementations) of tokens for each given token representation
:::

underlyingLookup: underlying => AssetConfig
    AssetConfig:
        eTokenAddress: address of eToken
        borrowIsolated
        collateralFactor
        borrowFactor
        tswapWindow

Underlying token represents the asset being held. When the owner loans an asset they trade the underlyingToken for an eToken

eTokenLookup: Retrieves Asset Storage for a given eToken type

dTokenLookup: Retrives address of eToken implementation for given dToken

pTokenLookup: Retrivies given underlying for pToken implementation

reversePTokenLookup: Retrivies given pToken for underlying

### Invariants

eToken_supply_equality:
        total balance should always be equal to the sum of each individual balance + reserve balance

dToken_supply_equality:
    total supply should always be equal to the sum of each individual balance

there should always be the same number of entrans in underlyingLookup and eTokenLookup


underlying_eToken_equality:
for arbitrary address "address"
    underlyingLookup(address) <=>
    eTokenLookup(underlyingLookup(address).eTokenAddress).underlying == address
 
e_to_u and u_to_e are two-sided inverses, where
  e_to_u(eToken) : uToken := eTokenLookup[eToken].underlying, and
  u_to_e(uToken) : eToken := uTokenLookup[uToken].eTokenAddress

e_to_d and d_to_e are two-sided inverses...

p_to_u u_to_p are two-sided inverses

sum(eTokenBalance) = sum(dTokenBalance)

    sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 

If totalBorrows > 0, an asset must have a non-zero interest accumulator
    eTokenLookup(eToken).totalBorrows != 0 => eTokenLookup(account).interestAccumulator != 0

If owed > 0 for a given UserAsset, so should the respective interestAccumulator
    for UserAsset = eTokenLookup(eToken).users(account)
        owed != 0 => interestAccumulator != 0

Profitability? 
    I don't believe the system inherently guarantees profitibality such as in the case of only lenders. But with a minimum ratio of borrow to lending it should be guaranteed

### State Evolution

lending_profitability
    if a user lends assets and then reclaims their assets, they should always reclaim greater than the amount they lent

borrowing_profitability
    if a user borrows money, they must always repay greater than they borrowed (to close)

protectedLending_profitability
    if a user lends protected assets and then reclaims their assets, they should never reclaim a greater amount than they lent
    ^ Guarantee of no interest on protectedAssets


