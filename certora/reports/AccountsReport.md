## Description
### Notes
### Bugs Found and Recommendations
### Assumptions Made

### Important State Variables

accountLookup

marketsEntered

### Invariants

no_double_markets:
    address A. address B.
    A != B => marketsEntered(account)[A] != marketsEntered(account)[B]

can an account be in a closed market?

If a user has a non-zero borrow owed, then they must be entered into market
and must have a non-zero interest accumulator
    UserAsset.owed != 0 => userAsset.interestAccumulator != 0 && accountLookup(user).numMarketsEntered != 0

Account_ID_Bounded
    in any location a sub-account is used, the maximum value is 255

No proxy may be a market for an account
    proxyLookup(id) != 0 => marketsEntered(account)[market] != proxyLookup(id) 
        forall address account. forall address market.
    ^ realistically we would have to this through a reverse lookup of some kind through either a ghost or harness

### State Evolution