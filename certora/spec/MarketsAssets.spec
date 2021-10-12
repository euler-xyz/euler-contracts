// general imports
import "./common.spec"

////////////////////////////////////////////////////////////////////////////
//                       ghosts                                           //
////////////////////////////////////////////////////////////////////////////

// sum of user's balances for eTokens
ghost sum_eToken_balance(address) returns mathint {
    init_state axiom forall address token. sum_eToken_balance(token) == 0;
}

ghost sum_dToken_owed(address) returns uint256 {
    init_state axiom forall address token. sum_dToken_owed(token) == 0;
}

// same problem as eToken hook
hook Sstore eTokenLookup[KEY address eToken].(offset 160)[KEY address user] uint256 assetInfo (uint256 oldAssetInfo) STORAGE {
    // update stored balances

    uint256 balance = assetInfo >> 144; // first 14 bytes
    uint256 owed = assetInfo & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;// latter 18 bytes

    uint256 oldBalance = oldAssetInfo >> 144; // first 14 bytes
    uint256 oldOwed = oldAssetInfo & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;// latter 18 bytes

    havoc sum_dToken_owed assuming forall address e. e == eToken
    ?  sum_dToken_owed@new(e) == sum_dToken_owed@old(e) + owed - oldOwed
    :  sum_dToken_owed@new(e) == sum_dToken_owed@old(e);

    havoc sum_eToken_balance assuming forall address e. e == eToken 
    ?  sum_eToken_balance@new(e) == sum_eToken_balance@old(e) + to_mathint(balance - oldBalance)
    :  sum_eToken_balance@new(e) == sum_eToken_balance@old(e);
}

ghost sum_total_borrows(address) returns uint {
    init_state axiom forall address token. sum_total_borrows(token) == 0;
} 

ghost sum_total_balances(address) returns uint {
    init_state axiom forall address token. sum_total_balances(token) == 0; 
}

hook Sstore eTokenLookup[KEY address eToken].(offset 96) uint256 totals (uint256 oldTotals) STORAGE {
    uint256 balance = totals >> 144;
    uint256 owed = totals & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    uint256 oldBalance = oldTotals >> 144; // first 14 bytes
    uint256 oldOwed = oldTotals & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;// latter 18 bytes

    havoc sum_total_borrows assuming forall address e. e == eToken
    ?   sum_total_borrows@new(e) == sum_total_borrows@old(e) + owed - oldOwed
    :   sum_total_borrows@new(e) == sum_total_borrows@old(e);

    havoc sum_total_balances assuming forall address e. e == eToken 
    ?   sum_total_balances@new(e) == sum_total_balances@old(e) + balance - oldBalance
    :   sum_total_balances@new(e) == sum_total_balances@old(e);
}

// sum of user interests for a given eToken
ghost sum_user_interests(address) returns uint {
    init_state axiom forall address token. sum_user_interests(token) == 0; 
}

hook Sstore eTokenLookup[KEY address eToken].(offset 160)[KEY address user].(offset 32) uint256 interestAcc (uint256 oldInterestAcc) STORAGE {

    havoc sum_user_interests assuming forall address e. e == eToken
    ?   sum_user_interests@new(e) == sum_user_interests@old(e) + interestAcc - oldInterestAcc
    :   sum_user_interests@new(e) == sum_user_interests@old(e);
}

////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

invariant eToken_supply_equality(address token)
    to_mathint(et_totalBalances(token)) == to_mathint(et_reserveBalance(token)) + sum_eToken_balance(token)
{ preserved transfer(address to, uint amount) with (env e) {
    require et_user_balance(token, e.msg.sender) <= sum_eToken_balance(token);
} preserved transferFrom(address from, address to, uint amount) with (env e) {
    require et_user_balance(token, e.msg.sender) <= sum_eToken_balance(token);
} }

invariant tk_eToken_supply_equality(address token)
    to_mathint(et_totalBalances(token)) != to_mathint(et_reserveBalance(token)) + sum_eToken_balance(token)
{ preserved transfer(address to, uint amount) with (env e) {
    require et_user_balance(token, e.msg.sender) <= sum_eToken_balance(token);
} preserved transferFrom(address from, address to, uint amount) with (env e) {
    require et_user_balance(token, e.msg.sender) <= sum_eToken_balance(token);
} }

// // sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
// invariant underlying_supply_equality(env e, address eToken) // TODO: address of euler
//     convert_to_underlying(sum_total_balances(eToken)) + reserveBalanceUnderlying(e) <= EToken_totalSupplyUnderlying(e)

invariant dToken_supply_equality(address token)
    sum_dToken_owed(token) == to_uint256(et_totalBorrows(token))

invariant tk_dToken_supply_equality(address token)
    sum_dToken_owed(token) != to_uint256(et_totalBorrows(token))

invariant zk_sum_dToken_zero(address token)
    sum_dToken_owed(token) == 0

// every etoken address in underlyingLookup maps to an eToken, which maps back to it
invariant underlying_eToken_equality(address underlying, address eToken) 
    underlying_eTokenAddress(underlying) != 0 => et_underlying(underlying_eTokenAddress(underlying)) == underlying &&
    et_underlying(eToken) != 0 => underlying_eTokenAddress(et_underlying(eToken)) == eToken

// // p_to_u u_to_p are two-sided inverses
invariant pToken_underlying_equality(address pToken, address underlying) 
    pTokenLookup(pToken) != 0 => reversePTokenLookup(pTokenLookup(pToken)) == pToken &&
    reversePTokenLookup(underlying) != 0 => pTokenLookup(reversePTokenLookup(underlying)) == underlying

// Amount held by Euler + borrows should be accurate to the theoretical holdings
// EToken_totalSupply(e) ~= ERC20.balanceOf(euler) + sum_total_borrows()
invariant eToken_euler_supply(env e, address eToken)
    EToken_totalSupply(e) == ERCBalanceOf(et_underlying(eToken), eToken) + sum_total_borrows(eToken)

// same as above but with underlying conversions
invariant underling_euler_supply(env e, address eToken)
    EToken_totalSupplyUnderlying(e) <= ERCBalanceOf(et_underlying(eToken), eToken) + sum_total_borrows(eToken)

// // If totalBorrows > 0, an asset must have a non-zero interest accumulator
invariant borrower_group_nontrivial_interest(address eToken)
    et_totalBorrows(eToken) != 0 <=> et_interestAccumulator(eToken) != 0    

// // If owed > 0 for a given UserAsset, so should the respective interestAccumulator
invariant borrower_individual_nontrivial_interest(address eToken, address user)
    et_user_owed(eToken, user) != 0 <=> et_user_interestAccumulator(eToken, user) != 0

invariant interest_sum(address eToken)
    et_interestAccumulator(eToken) == sum_user_interests(eToken)


// ////////////////////////////////////////////////////////////////////////////
// //                       Rules                                            //
// ////////////////////////////////////////////////////////////////////////////
    
// // if a user borrows money, they must always repay greater than they borrowed (to close)
// rule protectedLending_profitability() { // TODO

//     assert false, "not yet implemented";
// }

// // For any transaction that affects the balance of any user's account, only the balance of that user's account may be affected
// // to start we are only going to test this on eTokens

rule eToken_transactions_contained(method f) filtered 
    { f -> (f.selector != transfer(address, uint).selector &&
          f.selector != transferFrom(address, address, uint).selector) } // transfer functions do not apply properly for this rule and should be tested seperately 
{
    env e; calldataarg args;

    address eToken1;
    address eToken2;
    address user1;
    address user2; 

    uint112 balance1_pre = et_user_balance(eToken1, user1);
    uint144 owed1_pre = et_user_owed(eToken1, user1);
    uint112 balance2_pre = et_user_balance(eToken2, user2);
    uint144 owed2_pre = et_user_owed(eToken2, user2);

    f(e, args);

    uint112 balance1_post = et_user_balance(eToken1, user1);
    uint144 owed1_post= et_user_owed(eToken1, user1);
    uint112 balance2_post = et_user_balance(eToken2, user2);
    uint144 owed2_post = et_user_owed(eToken2, user2);

    assert balance1_pre != balance1_post => balance2_pre == balance2_post || (eToken1 == eToken2 && user1 == user2), "balance of seperate account or token changed";
    assert balance1_pre != balance1_post => owed1_pre == owed1_post, "balance change also affected owed";
    assert owed1_pre != owed1_post => owed2_pre == owed2_post || (eToken1 == eToken2 && user1 == user2), "owed of seperate account or token changed";
    assert owed1_pre != owed1_post => balance1_pre == balance1_post, "owed change also affected balance";
}

// rule check_ERC20() {
//     env e;
//     address user; address to;
//     uint balance_pre = ERCDummyBalanceOf(user);
//     uint to_balance_pre = ERCDummyBalanceOf(to);
//     uint amount;

//     require amount != 0;
//     require to != user; 
//     require amount < balance_pre;

//     ERCTransferFrom(user, to, amount); 

//     uint balance_post = ERCDummyBalanceOf(user);
//     uint to_balance_post = ERCDummyBalanceOf(to);

//     assert balance_post == balance_pre - amount, "wrong amount removed";
//     assert to_balance_post == to_balance_pre + amount, "wrong amount added";
// }

////////////////////////////////////////////////////////////////////////////
//                       Helper Functions                                 //
////////////////////////////////////////////////////////////////////////////
