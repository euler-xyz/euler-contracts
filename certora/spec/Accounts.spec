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

invariant no_double_markets(): // TODO
    false 
    // address A. address B.
    // A != B => marketsEntered(account)[A] != marketsEntered(account)[B]

// If a user has a non-zero borrow owed, then they must be entered into market
// and must have a non-zero interest accumulator
//     UserAsset.owed != 0 => userAsset.interestAccumulator != 0 && accountLookup(user).numMarketsEntered != 0
invariant user_proper_borrow(): // TODO
    false


// in any location a sub-account is used, the maximum value is 255
invariant Account_ID_Bounded(): // TODO
    false

// No proxy may be a market for an account
invariant no_proxy_market(): // TODO
    false
    // proxyLookup(id) != 0 => marketsEntered(account)[market] != proxyLookup(id) 
    //     forall address account. forall address market.
    // ^ realistically we would have to this through a reverse lookup of some kind through either a ghost or harness
////////////////////////////////////////////////////////////////////////////
//                       Rules                                            //
////////////////////////////////////////////////////////////////////////////
    