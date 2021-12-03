
// balance of 2 user is no greater than the total balance for a given token
invariant totalBalance_constrains_userBalance(address user1, address user2, address token)
    et_user_balance(token, user1) + et_user_balance(token, user2) <= et_totalBalances(token)

invariant totalBorrows_constrains_userOwed(address user1, address user2, address token)
    et_user_owed(token, user1) + et_user_owed(token, user2) <= et_totalBorrows(token)

