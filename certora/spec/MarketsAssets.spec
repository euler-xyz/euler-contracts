// general imports
import "./common.spec"

////////////////////////////////////////////////////////////////////////////
//                       ghosts                                           //
////////////////////////////////////////////////////////////////////////////

/// sum of users' balance amounts
ghost mapping(address => mathint) sum_eToken_balance {
    init_state axiom forall address token . sum_eToken_balance[token] == 0;
}

hook Sstore eTokenLookup[KEY address eToken].users[KEY address user].balance uint112 userBalance (uint112 oldUserBalance) STORAGE {
    sum_eToken_balance[eToken] = sum_eToken_balance[eToken] + userBalance - oldUserBalance;
}

/// sum of users' owed amounts  
ghost mapping(address => mathint) sum_dToken_owed {
    init_state axiom forall address token . sum_dToken_owed[token] == 0;
}

hook Sstore eTokenLookup[KEY address eToken].users[KEY address user].owed uint144 userOwed (uint144 oldUserOwed) STORAGE {
    sum_dToken_owed[eToken] = sum_dToken_owed[eToken] + userOwed - oldUserOwed;
}

/// sum of user interests for a given eToken
ghost mapping(address => mathint) sum_user_interests {
    init_state axiom forall address token . sum_dToken_owed[token] == 0;
}


hook Sstore eTokenLookup[KEY address eToken].users[KEY address user].interestAccumulator uint256 interestAcc (uint256 oldInterestAcc) STORAGE {
    sum_user_interests[eToken] = sum_user_interests[eToken] + interestAcc - oldInterestAcc;
}

////////////////////////////////////////////////////////////////////////////
// Solvency properties                                                    //
////////////////////////////////////////////////////////////////////////////

/// For a given EToken t, totalBalances(t) is the sum of the reserve balance of
/// t and the sum of the users' EToken balances
///
/// @dev this was eToken_supply_equality
invariant totalBalanceIsSumOfUserBalances(address token)
   to_mathint(et_totalBalances(token)) == to_mathint(et_reserveBalance(token)) + sum_eToken_balance[token]

/// For a given DToken t, totalBorrows(t) is the sum of all users' owed tokens
///
/// @dev this was originally called dToken_supply_equality
invariant totalBorrowsIsSumOfUserBorrows(address token)
    sum_dToken_owed[token] == et_totalBorrows(token)


// // sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
// invariant underlying_supply_equality(env e, address eToken) // TODO: address of euler
//     convert_to_underlying(sum_total_balances(eToken)) + reserveBalanceUnderlying(e) <= EToken_totalSupplyUnderlying(e)

// needs rewrite
// same as above but with underlying conversions
// invariant underlying_euler_supply(env e, address eToken)
//     EToken_totalSupplyUnderlying(e) <= ERCBalanceOf(et_underlying(eToken), eToken) + sum_total_borrows(eToken)


////////////////////////////////////////////////////////////////////////////
// Structural properties                                                  //
////////////////////////////////////////////////////////////////////////////

/// every etoken address in underlyingLookup maps to an eToken, which maps back to it
invariant underlying_eToken_equality(address underlying, address eToken) 
    underlying_eTokenAddress(underlying) != 0 => et_underlying(underlying_eTokenAddress(underlying)) == underlying &&
    et_underlying(eToken) != 0 => underlying_eTokenAddress(et_underlying(eToken)) == eToken

/// The zero address is not a PToken
invariant pTokenLookup_zero()
    pTokenLookup(0) == 0

/// reversePTokenLookup • pTokenLookup is the identity on existing PTokens
invariant revPTokenLookup_of_pTokenLookup(address pToken)
    pTokenLookup(pToken) != 0 => reversePTokenLookup(pTokenLookup(pToken)) == pToken
    { preserved {
        requireInvariant pTokenLookup_zero();
    } }

/// pTokenLookup • reversePTokenLookup is the identity on existing underlying tokens
invariant pTokenLookup_of_revPTokenLookup(address underlying)
    reversePTokenLookup(underlying) != 0 => pTokenLookup(reversePTokenLookup(underlying)) == underlying
    { preserved {
        requireInvariant pTokenLookup_zero();
    } }


// INTEREST INVARIANTS - needs seperate testing
// // // If totalBorrows > 0, an asset must have a non-zero interest accumulator
// invariant borrower_group_nontrivial_interest(address eToken)
//     et_totalBorrows(eToken) != 0 <=> et_interestAccumulator(eToken) != 0    

// // // If owed > 0 for a given UserAsset, so should the respective interestAccumulator
// invariant borrower_individual_nontrivial_interest(address eToken, address user)
//     et_user_owed(eToken, user) != 0 <=> et_user_interestAccumulator(eToken, user) != 0

// invariant interest_sum(address eToken)
//     et_interestAccumulator(eToken) == sum_user_interests(eToken)

////////////////////////////////////////////////////////////////////////////
// Independence properties                                                //
////////////////////////////////////////////////////////////////////////////


/// With the exception of `transfer` and `transferFrom`, methods should affect
/// at most one user's balance or owed amount
///
/// @dev this is a modified version of the original
///      userAssets_transactions_contained rule
///
rule userIndependence(method f)
filtered {
    f -> f.selector != transfer(address, uint).selector
      && f.selector != transferFrom(address, address, uint).selector
}
{
    address eToken; address user1; address user2;
    require user1 != user2;

    mathint balance1_pre = et_user_balance(eToken, user1);
    mathint balance2_pre = et_user_balance(eToken, user2);

    mathint owed1_pre    = et_user_owed(eToken, user1);
    mathint owed2_pre    = et_user_owed(eToken, user2);

    env e; calldataarg args;
    f(e, args);

    mathint balance1_post = et_user_balance(eToken, user1);
    mathint balance2_post = et_user_balance(eToken, user2);

    mathint owed1_post = et_user_owed(eToken, user1);
    mathint owed2_post = et_user_owed(eToken, user2);

    assert balance1_pre == balance1_post || balance2_pre == balance2_post,
        "non-transfer operations must change at most one user's balance";

    assert owed1_pre == owed1_post || owed2_pre == owed2_post,
        "non-transfer operations must change at most one user's owed amount";
}

/// `transfer` must not affect third-party balances
rule transfersAffectTwoBalances {
    assert false, "TODO";
}

/// `transferFrom` must not affect third-party balances
rule transfersFromAffectTwoBalances {
    assert false, "TODO";
}


/// methods should only affect balances for a single token
rule tokenIndependence {
    address token1; address user1;
    address token2; address user2;

    require token1 != token2;

    mathint balance1_pre = et_user_balance(token1, user1);
    mathint balance2_pre = et_user_balance(token2, user2);

    mathint owed1_pre    = et_user_owed(token1, user1);
    mathint owed2_pre    = et_user_owed(token2, user2);

    method f; env e; calldataarg args;
    f(e, args);

    mathint balance1_post = et_user_balance(token1, user1);
    mathint balance2_post = et_user_balance(token2, user2);

    mathint owed1_post = et_user_owed(token1, user1);
    mathint owed2_post = et_user_owed(token2, user2);

    assert balance1_pre == balance1_post || balance2_pre == balance2_post,
        "transactions must only change balances for a single token";

    assert owed1_pre == owed1_post || owed2_pre == owed2_post,
        "transactions must only change owed amounts for a single token";
}

