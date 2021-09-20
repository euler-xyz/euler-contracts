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
    name() returns (string) 
    symbol() returns (string)
    decimals() returns (uint8)
    totalSupply() returns (uint) envfree
    totalSupplyUnderlying() returns (uint) envfree
    balanceOf(address ) returns (uint) envfree
    balanceOfUnderlying(address) returns (uint) envfree
    reserveBalance() returns (uint) envfree
    reserveBalanceUnderlying() returns (uint)
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

// named pattern root 'users' is not defined
// hook Sstore users[KEY address user] uint112 balance (uint oldBalance) STORAGE {
//     // update stored balances
//     havoc sum_eToken_balance assuming sum_eToken_balance@new(user) == sum_eToken_balance@old(user) + balance - oldBalance &&
//     // verifies no other values were changed
//     (forall address x.  x != user  => sum_eToken_balance@new(x) == sum_eToken_balance@old(x));
// }

ghost sum_dToken_owed(address) returns uint {
    init_state axiom forall address token. sum_dToken_owed(token) == 0;
} // TODO write hook (should be very similar to eTokenHoko)

// same problem as eToken hook
// hook Sstore users[KEY address user] uint144 owed (uint256 oldOwed) STORAGE {
//     // update stored balances
//     havoc sum_dToken_owed assuming sum_dToken_owed@new(user) == sum_dToken_owed@old(user) + owed - oldOwed &&
//     // verifies no other values were changed
//     (forall address x.  x != user  => sum_dToken_owed@new(x) == sum_dToken_owed@old(x));
// }


////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

// total balance should always be equal to the sum of each individual balance + reserve balance
invariant eToken_supply_equality(address token) // TODO
    sum_eToken_balance(token) + et_reserveBalance(token) == et_totalBalances(token)


// total supply should always be equal to the sum of each individual balance
invariant dToken_supply_equality(address token) // TODO
    sum_dToken_owed(token) == et_totalBorrows(token)

// every etoken address in underlyingLookup maps to an eToken, which maps back to it
invariant underlying_to_eToken(address underlying) // TODO
    underlying_eTokenAddress(underlying) != 0 => et_underlying(underlying_eTokenAddress(underlying)) == underlying

// every underlying address in eTokenLookup maps to an underlying, which maps back to it
invariant eToken_to_underlying(address eToken)
    et_underlying(eToken) != 0 => underlying_eTokenAddress(et_underlying(eToken)) == eToken

// // p_to_u u_to_p are two-sided inverses
invariant pToken_to_underlying(address pToken) // TODO
    pTokenLookup(pToken) != 0 => reversePTokenLookup(pTokenLookup(pToken)) == pToken

invariant underlying_to_pToken(address underlying)
    reversePTokenLookup(underlying) != 0 => pTokenLookup(reversePTokenLookup(underlying)) == pToken


// sum(eTokenBalance) + reserveBalance - dTokenBalance == current_balance 
// invariant asset_reserves_accurate() // TODO
//     false

    
// // sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
// invariant underlying_supply_balance_comparison() // TODO 
//     false

// // If totalBorrows > 0, an asset must have a non-zero interest accumulator
// invariant borrower_group_nontrivial_interest() // TODO
//     false
// // eTokenLookup(eToken).totalBorrows != 0 => eTokenLookup(account).interestAccumulator != 0

// // If owed > 0 for a given UserAsset, so should the respective interestAccumulator
// invariant borrower_individual_nontrivial_interest() // TODO
//     false
//     // for UserAsset = eTokenLookup(eToken).users(account)
//     //     owed != 0 => interestAccumulator != 0

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
// rule transactions_contained(method f) {
//     env e; calldataarg args;

//     address eToken1;
//     address eToken2;
//     address user1;
//     address user2;



//     f(e, args);

//     assert false, "not yet implemented";
// }


////////////////////////////////////////////////////////////////////////////
//                       Helper Functions                                 //
////////////////////////////////////////////////////////////////////////////
