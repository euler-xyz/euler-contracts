/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with scripts/...
*/

// general imports
import "../helpers/erc20.spec"
import "./common.spec"
using DummmyERC20A as ERC20
using Storage as Storage

// contract specific (one currently being tested)
using ETokenHarness as E



////////////////////////////////////////////////////////////////////////////
//                      Methods                                           //
////////////////////////////////////////////////////////////////////////////

methods {

    // EToken Functions
    name() returns (string) 
    symbol() returns (string)
    decimals() returns (uint8)
    totalSupply() returns (uint) // envfree
    totalSupplyUnderlying() returns (uint)  // envfree
    balanceOf(address ) returns (uint) envfree
    balanceOfUnderlying(address) returns (uint) // envfree
    reserveBalance() returns (uint) //envfree
    reserveBalanceUnderlying() returns (uint) // envfree
    deposit(uint, uint)
    withdraw(uint, uint)
    mint(uint, uint)
    burn(uint, uint)
    approve(address, uint) returns (bool)
    approveSubAccount(uint, address, uint) returns (bool)
    allowance(address, address) returns (uint)
    transfer(address, uint) returns (bool)
    transferFrom(address, address, uint) returns (bool)
}
////////////////////////////////////////////////////////////////////////////
//                       ghosts                                           //
////////////////////////////////////////////////////////////////////////////

// sum of user's balances for eTokens
ghost sum_eToken_balance(address) returns uint {
    init_state axiom forall address token. sum_eToken_balance(token) == 0;
} // TODO write hook

ghost sum_dToken_owed(address) returns uint {
    init_state axiom forall address token. sum_dToken_owed(token) == 0;
} // TODO write hook (should be very similar to eTokenHoko)

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
    ?  sum_eToken_balance@new(e) == sum_eToken_balance@old(e) + balance - oldBalance
    :  sum_eToken_balance@new(e) == sum_eToken_balance@old(e);
}

ghost sum_total_borrows() returns uint {
    init_state axiom sum_total_borrows() == 0;
} 

ghost sum_total_balances() returns uint {
    init_state axiom sum_total_balances() == 0; 
}

hook Sstore eTokenLookup[KEY address eToken].(offset 96) uint256 totals (uint256 oldTotals) STORAGE {
    uint256 balance = totals >> 144;
    uint256 owed = totals & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    uint256 oldBalance = oldTotals >> 144; // first 14 bytes
    uint256 oldOwed = oldTotals & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;// latter 18 bytes

    havoc sum_total_borrows assuming sum_total_borrows@new() == sum_total_borrows@old() + owed - oldOwed;
    havoc sum_total_balances assuming sum_total_balances@new() == sum_total_balances@old() + balance - oldBalance;
}

ghost sum_underlying_balance() returns uint {
    init_state axiom sum_underlying_balance() == 0;
} // TODO


////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

// total balance should always be equal to the sum of each individual balance + reserve balance
invariant eToken_supply_equality(address token)
    sum_eToken_balance(token) + to_uint256(et_reserveBalance(token)) == to_uint256(et_totalBalances(token))


// total supply should always be equal to the sum of each individual balance
invariant dToken_supply_equality(address token)
    sum_dToken_owed(token) == to_uint256(et_totalBorrows(token))

// every etoken address in underlyingLookup maps to an eToken, which maps back to it
invariant underlying_eToken_equality(address underlying, address eToken) // TODO
    underlying_eTokenAddress(underlying) != 0 => et_underlying(underlying_eTokenAddress(underlying)) == underlying &&
    et_underlying(eToken) != 0 => underlying_eTokenAddress(et_underlying(eToken)) == eToken

// // p_to_u u_to_p are two-sided inverses
invariant pToken_underlying_equality(address pToken, address underlying) // TODO
    pTokenLookup(pToken) != 0 => reversePTokenLookup(pTokenLookup(pToken)) == pToken &&
    reversePTokenLookup(underlying) != 0 => pTokenLookup(reversePTokenLookup(underlying)) == underlying


// sum(eTokenBalance) + reserveBalance - dTokenBalance == current_balance 
// amount borrowed + reserve is the total amount circulating, subtract the dTokenBalance and that should be the amount the pool currently holds
// invariant asset_reserves_accurate() // TODO
//     false

    
// // sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
invariant underlying_supply_balance_comparison(env e) // TODO: figure out balance of euler and write hooks
    sum_underlying_balance() + reserveBalanceUnderlying(e) <= totalSupplyUnderlying(e) //  <= balanceOf(euler) + total_borrows()

// // If totalBorrows > 0, an asset must have a non-zero interest accumulator
invariant borrower_group_nontrivial_interest(address eToken)
    et_totalBorrows(eToken) != 0 <=> et_interestAccumulator(eToken) != 0    

// // If owed > 0 for a given UserAsset, so should the respective interestAccumulator
invariant borrower_individual_nontrivial_interest(address eToken, address user)
    et_user_owed(eToken, user) != 0 <=> et_user_interestAccumulator(eToken, user) != 0

// invariant profitability() // TODO
//     false
//     // I don't believe the system inherently guarantees profitibality such as in the case of only lenders. But with a minimum ratio of borrow to lending it should be guaranteed

// ////////////////////////////////////////////////////////////////////////////
// //                       Rules                                            //
// ////////////////////////////////////////////////////////////////////////////
    
// // if a user lends assets and then reclaims their assets, they should always reclaim greater than the amount they lent
// rule lending_profitability() { // TODO

//     assert false, "not yet implemented";
// }

// // if a user borrows money, they must always repay greater than they borrowed (to close)
// rule borrowing_profitability() { // TODO

//     assert false, "not yet implemented";
// }

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


////////////////////////////////////////////////////////////////////////////
//                       Helper Functions                                 //
////////////////////////////////////////////////////////////////////////////
