---
breaks: false
---

## Formal Verification Report for Euler's Assets and Markets

### Notes

Underlying token represents the asset being held. When the owner loans an asset they trade the underlyingToken for an eToken

Look at reentrantOK

TODO: liquidity checks / deferred liquidity

TODO: set up special checking for the accrueInterest method, and ensure that the
[^checkAccrue] annotations are checked (and add them as necessary).

Don't requireInvariant `non_reeentrant` anywhere

### Bugs Found and Recommendations

- Minor: TODO: refactoring initAssetCache

- Minor: it would be helpful to add comments on the
  `AssetStorage.eTokenAllowance` and `AssetStorage.dTokenAllowance` fields so
  that it is clear what the two indices represent (presumably sender address and
  recipient address)

- Minor: comments on the units for the fields in AssetStorage would be helpful

### Assumptions and Simplifications

TODO: describe harnessing and other unsoundnesses

### State variables

```
underlyingLookup: underlying => AssetConfig
    AssetConfig:
        eToken address
        borrowIsolated:   TODO
        collateralFactor: TODO
        borrowFactor:     TODO
        tswapWindow:      TODO

eTokenLookup: eToken address => AssetStorage
    underlying address
    underlying decimals
    dToken     address

    interest rate, reserve fee, and pricing information

    interest accumulator: multiplier - if you had one unit at the beginning of time, how much you would have now

    reserve balance: the reserve amount, in eToken units
    total balance:   the sum of outstanding eTokens and reserveBalance
    total borrows:   the sum of outstanding dTokens in underlying units (greater precision: 27 decimals)

    users: user address => UserAsset
        balance:  the number of eTokens held by the user
        owed:     the number of dTokens held by the user (1:1 conversion dToken)
        interest: the total accrued interest for this account

    eTokenAllowance: source user address => recipient user address => balance
    dTokenAllowance: source user address => recipient user address => balance

dTokenLookup:        dToken address     => eToken address
pTokenLookup:        pToken address     => underlying address
reversePTokenLookup: underlying address => pToken address

ERC20 balance of Euler: underlying address => balance
```

### Invariants

#### Accurate totals

(![FAILING])[^transferFail][^mintBug] `eToken_supply_equality`
: for each eToken, `totalBalance` is the sum of the reserve
  balance and all users' eToken balances

  [^transferFail]:
      TODO: Fails on transfer functions.  seems to indicate individual balances
      being changed but total balances kept the same (bug?)
  
  [^mintBug]:
      TODO: mint is tripping CVT bug, to workaround: harness around
      _getMarketEnteredIndex.

(![PASSING])[^mintBug][^checkAccrue] `dToken_supply_equality`
: `totalBorrows` for each eToken is the sum of the users' owed amounts

(![TODO]) `interest_sum`
: the interestAccumulator for each eToken is the sum of the users' interest accumulators
  TODO: this is incorrect

#### Structural invariants

(![PASSING]) `underlying_eToken_equality`
: underlying to eToken and eToken to underlying are two-sided inverses

(![PASSING]) `token_underlying_equality`
: underlying to pToken and pToken to underlying are two-sided inverses

(![TODO]) `eToken_dToken_equality`
: eToken to dToken and dToken to eToken are two-sided inverses

(![TODO]) `underlying_decimals_correct`
: I think underlying decimals is supposed to be constant?

#### Solvency

(![TODO]) `asset_reserves_accurate`
: Euler's ERC20 balance for underlying is `toUnderlying(totalBalances - totalBorrows + reserveBalance)`
  TODO: what if toUnderlying changes?

(![TODO]) `underlying_supply_balance_comparison`
: sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
  TODO: I think this is a duplicate of the above rule, but converted to underlying?

#### Interest accumulation

(![FAILING]) `borrower_group_nontrivial_interest`
: If totalBorrows > 0, an asset must have a non-zero interest accumulator
  on burn total borrowers can overflow if burn is called on a token with 0 borrows
  on mint borrow is increased but interest rate is unchanged, not sure as to why

(![FAILING])[^mintInterestFail] `borrower_individual_nontrivial_interest`
: If owed > 0 for a given UserAsset, so should the respective interestAccumulator
  if mint of value 0 is called the interestAccumulator goes from 1 to 0
  if burn of value 0 is called the interestAccumulator goes from 1 to 0

  [^mintInterestFail]: Failing on mint, seems to be due to minting creating D Token but not actually counting as a borrow? needs further investigation
      https://vaas-stg.certora.com/output/83314/040f73cab673fd62b796/?anonymousKey=9e9d919d6cb099d11bee5f50415cc098a3be0abe#borrower_individual_nontrivial_interestResults

#### Allowances

(![TODO])
: A user's total eToken allowances should be less than their balance
  TODO: Maybe you can set a higher allowance than you have

(![TODO])
: A user's total dToken allowances (incoming) should be less than their balance
  TODO: Maybe you can set a higher allowance than you have

### State Evolution

Main state-changing operations:

- EToken.deposit:  receive underlying, issue eTokens
- EToken.withdraw: remit underlying,   burn eTokens
- EToken.mint:     issue equal value of eTokens and dTokens (not same number)
- EToken.burn:     burn equal value of eTokens and dTokens  (not same number)

- EToken.approve / approveSubAccount: increase allowance
- EToken.transfer / EToken.transferFrom: transfer eTokens to/from another acct

- DToken.borrow:   remit underlying, mint dTokens
- DToken.repay:    receive underlying, burn dTokens 
- DToken.approve / approveSubAccount:  increase allowance
- DToken.transfer / DToken.transferFrom: transfer dTokens to/from another acct

- Liquidation.liquidate: TODO

- deferLiquidityCheck: TODO

- Markets.activateMarket: create pool and EToken and DToken addresses
- Markets.activatePToken: create and activate pToken
- Markets.enterMarket / exitMarket:    TODO

(![TODO]) `interest_nondecreasing`
: The interestAccumulator for each eToken never decreases

(![TODO]) `user_interest_nondecreasing`
: The interestAccumulator for each user never decreases

(![TODO]) `repayment_reserve`
: If the totalBorrows decreases, then the reserve should increase
  TODO: I think, but maybe this happens when the total balance decreases instead?

(![PASSING]) `transactions_contained`
: Any transaction that affects the balance of a user's account must be initiated
  by that user (TODO: except transfer functions)

(![TODO]) `etoken_transfer_allowance`
: If an operation by B reduces A's eToken balance then the change in A's
  eToken balance is equal to the change in A's eToken allowance for B.
  (in particular, if A's allowance is 0 then B cannot reduce A's eT balance)

(![TODO]) `dtoken_transfer_allowance`
: If an operation by B increases A's dToken balance then the change in A's
  dToken balance is equal to the change in A's dToken allowance for B.
  (in particular, if A's allowance is 0 then B cannot increase A's dT balance)

### High level rules

#### Lending:

(![TODO]) `lending_profitability`
: If a user lends assets and then reclaims their assets, they should always reclaim at least the amount that they lent

(![TODO]) `protectedLending_profitability`
: If a user lends protected assets and then reclaims their assets, they should never reclaim more than they lent (no interest on protected assets)

#### Borrowing

(![TODO]) `borrowing_profitability`
: If a user borrows money, they must always repay at least what they borrowed to close their account

#### Transfering

(![TODO]) `eToken_allowance_bound`
: If A's eToken allowance to B is x, then no sequence of operations by B can
  reduce A's eToken balance by more than x

(![TODO]) `dToken_allowance_bound`
: If A's allowance

### Rounding

(![TODO]) `rounding`
: Converting eToken to underlying to eToken nonincreases amount,
  Converting dToken to underlying to dToken nondecreases amount

### Mint/burn within block transaction

### Unit test rules

(![TODO]) `lending_accuracy`
: If a user lends an amount, the proper amount is transfered and incremented in the account

(![TODO]) `borrowing_accuracy`
: If a user borrows an amount, the proper amount is transfered and incremented in the account

[^checkAccrue]:
    TODO: It is important to check this property on the `BaseLogic.accrueInterest` method.
    This method updates the `totalBorrows`, `interestAccumulator`, `reserveBalance`, and `totalBalances`

