* If a user has a non-zero borrow owed:
  * they must be entered into market
  * must have a non-zero interest accumulator
* If totalBorrows > 0, an asset must have a non-zero interest accumulator
* reentrancyLock must always be restored to REENTRANCYLOCK__UNLOCKED
* A user cannot have duplicate entries in their entered market list

* on eTokens: sumAll(balanceOf) + reserveBalance == totalBalance
* sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows
    (When adding up individual balances and the reserves, fractions of underlying can get rounded down. Similarly, the totalSupplyUnderlying can be rounded down by at most 1 token unit.)

* deposit should only result in an increase of eToken balance, and should affect no other asset
* withdraw should only result in a decrease of eToken balance, and should affect no other asset
* borrow should only result in an increase of dToken balance, and should affect no other asset
* repay should only result in a decrease of dToken balance, and should affect no other asset

* No protocol action should be able to result in an account with risk adjusted liability > risk adjusted assets (checkLiquidity failing)
* If an asset is borrow isolated, any user borrowing it must not be borrowing any other asset
* No proxy address (eToken/dToken/etc) can be activated as a market
* No token with collateral factor of 0 can contribute to your risk-adjusted asset value
* Passing in a sub-account id > 255 should fail, everywhere
