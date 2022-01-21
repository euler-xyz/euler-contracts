
// balance of 2 user is no greater than the total balance for a given token
invariant totalBalance_constrains_userBalance(address user1, address user2, address token)
    et_user_balance(token, user1) + et_user_balance(token, user2) <= et_totalBalances(token)

invariant totalBorrows_constrains_userOwed(address user1, address user2, address token)
    et_user_owed(token, user1) + et_user_owed(token, user2) <= et_totalBorrows(token)

/*
    The below invariant seems wrong, so a better one needs to be produced

    What we want to show is that no amount of asset is "lost" so the spply of underlying held by the system is 
    equivalent to the amount lent by users, the reserve, and then the amount borrowed
*/
// Amount held by Euler + borrows should be accurate to the theoretical holdings
// EToken_totalSupply(e) ~= ERC20.balanceOf(euler) + sum_total_borrows()
// token DummyERC20A:
// TotalSupply() = balanceOf(euler) + sum_total_borrows()
invariant eToken_euler_supply(env e, address eToken)
    EToken_totalSupply(e) == ERCBalanceOf(eToken, currentContract) + sum_total_borrows(eToken)
    // EToken_totalSupply(e) == et_totalBalances(eToken) + et_totalBorrows(eToken)
    // EToken_totalSupply(e) == ERCBalanceOf(eToken), eToken) + sum_total_borrows(eToken)

