/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with scripts/...
*/

////////////////////////////////////////////////////////////////////////////
//                      Methods                                           //
////////////////////////////////////////////////////////////////////////////

methods {

}

////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////

// total balance should always be equal to the sum of each individual balance + reserve balance
invariant eToken_supply_equality() // TODO
    false


// total supply should always be equal to the sum of each individual balance
invariant dToken_supply_equality() // TODO
    false 

// there should always be the same number of entrans in underlyingLookup and eTokenLookup
invariant underlying_eToken_equality() // TODO
    false
    // for arbitrary address "address"
    // underlyingLookup(address) <=>
    // eTokenLookup(underlyingLookup(address).eTokenAddress).underlying == address
 
// e_to_u and u_to_e are two-sided inverses, where
//   e_to_u(eToken) : uToken := eTokenLookup[eToken].underlying, and
//   u_to_e(uToken) : eToken := uTokenLookup[uToken].eTokenAddress

// p_to_u u_to_p are two-sided inverses
invariant pToken_underlying_equality() // TODO
    false


// sum(eTokenBalance) + reserveBalance - dTokenBalance == current_balance 
invariant asset_reserves_accurate() // TODO
    false

    
// sumAll(balanceOfUnderlying)) + reserveBalanceUnderlying <= totalSupplyUnderlying <= balanceOf(euler) + totalBorrows 
invariant underlying_supply_balance_comparison() // TODO 
    false

// If totalBorrows > 0, an asset must have a non-zero interest accumulator
invariant borrower_group_nontrivial_interest() // TODO
    false
// eTokenLookup(eToken).totalBorrows != 0 => eTokenLookup(account).interestAccumulator != 0

// If owed > 0 for a given UserAsset, so should the respective interestAccumulator
invariant borrower_individual_nontrivial_interest() // TODO
    false
    // for UserAsset = eTokenLookup(eToken).users(account)
    //     owed != 0 => interestAccumulator != 0

invariant profitability() // TODO
    false
    // I don't believe the system inherently guarantees profitibality such as in the case of only lenders. But with a minimum ratio of borrow to lending it should be guaranteed

////////////////////////////////////////////////////////////////////////////
//                       Rules                                            //
////////////////////////////////////////////////////////////////////////////
    
// if a user lends assets and then reclaims their assets, they should always reclaim greater than the amount they lent
rule lending_profitability() { // TODO

    assert false, "not yet implemented";
}

// if a user borrows money, they must always repay greater than they borrowed (to close)
rule borrowing_profitability() { // TODO

    assert false, "not yet implemented";
}

// if a user borrows money, they must always repay greater than they borrowed (to close)
rule protectedLending_profitability() { // TODO

    assert false, "not yet implemented";
}

////////////////////////////////////////////////////////////////////////////
//                       Helper Functions                                 //
////////////////////////////////////////////////////////////////////////////
