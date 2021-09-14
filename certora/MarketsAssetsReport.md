## Description
### Notes
### Bugs Found and Recommendations
### Assumptions Made

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

eTokenLookup: 

dTokenLookup:

pTokenLookup:

reversePTokenLookup:

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