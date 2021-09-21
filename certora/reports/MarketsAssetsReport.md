## Description
### Notes
### Bugs Found and Recommendations
### Assumptions Made


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

1. (![FAILING]) `eToken_supply_equality`:
        total balance should always be equal to the sum of each individual balance + reserve balance

    ^ Fails on transfer functions, hook inlining on mint, passes everywhere else
    Failure on transfer seems to indicate individual balances being changed but total balances kept the same

2. (![PASSING/EXCEPTION]) `dToken_supply_equality`:
    total supply should always be equal to the sum of each individual balance
        
    ^ passes on every function except for mint where there's a hook inlining exception

3. (![Passing]) `underlying_eToken_equality`:
for arbitrary address "address"
    underlyingLookup(address) <=>
    eTokenLookup(underlyingLookup(address).eTokenAddress).underlying == address

:::info 
e_to_u and u_to_e are two-sided inverses, where
  e_to_u(eToken) : uToken := eTokenLookup[eToken].underlying, and
  u_to_e(uToken) : eToken := uTokenLookup[uToken].eTokenAddress
:::

<!-- e_to_d and d_to_e are two-sided inverses...
    ^ outdated and no longer true -->

4. (![Passing]) `Token_underlying_equality`:
    p_to_u u_to_p are two-sided inverses

5. (![TODO]) `asset_reserves_accurate`:
    sum(eTokenBalance) + reserveBalance - dTokenBalance == current_balance 

6. (![TODO]) `underlying_supply_balance_comparison`:
    sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 

7. (![Passing]) `borrower_group_nontrivial_interest`:
    If totalBorrows > 0, an asset must have a non-zero interest accumulator

8. (![Failing]) `borrower_individual_nontrivial_interest`:
    If owed > 0 for a given UserAsset, so should the respective interestAccumulator

    ^ Failing on mint, seems to be due to minting creating D Token but not actually counting as a borrow? needs further investigation
    https://vaas-stg.certora.com/output/83314/040f73cab673fd62b796/?anonymousKey=9e9d919d6cb099d11bee5f50415cc098a3be0abe#borrower_individual_nontrivial_interestResults

9. (![TODO]) `profitability`
    I don't believe the system inherently guarantees profitibality such as in the case of only lenders. But with a minimum ratio of borrow to lending it should be guaranteed

### State Evolution

10. Lending:
    10.1 (![TODO]) `lending_profitability`:
        if a user lends assets and then reclaims their assets, they should always reclaim greater than the amount they lent
    10.2 (![TODO]) `lending_accuracy`:
        if a user lends an amount, the proper amount is transfered and incremented in the account
    10.3 (![TODO]) `protectedLending_profitability`
        if a user lends protected assets and then reclaims their assets, they should never reclaim a greater amount than they lent
        ^ Guarantee of no interest on protectedAssets

11. Borrowing:
    11.1 (![TODO]) `borrowing_profitability`
        if a user borrows money, they must always repay greater than they borrowed (to close)
    11.2 (![TODO]) `borrowing_accuracy`:
        if a user borrows an amount, the proper amount is transfered and incremented in the account

12. (![Passing]) `transactions_contained`:
    For any transaction that affects the balance of any user's account, only the balance of that user's account may be affected 
    
    ^ filtered out transfer functions to be tested seperately 
