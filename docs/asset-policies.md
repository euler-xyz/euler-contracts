## Asset Policies

### Supply/Borrow caps

For some assets it is desired to limit the amount of assets supplied and/or borrowed on the platform. This could be done in order to phase-in a collateral asset while minimising exposure to the protocol. An asset may also have a limited amount of on-chain liquidity, which could merit capping the lending/borrowing activity.

While it is possible for governance to lower a cap to below the current supply/borrow level, caps are not intended to function as emergency pause mechanisms. It should still be possible to withdraw/repay, even when an asset is in violation of the cap. This should be true even if your withdraw/repay is insufficient to solve the violation, and the asset's supply/borrow remains above the cap after your operation.

Furthermore, it should be possible to temporarily exceed the cap, as long as the supply/borrows are brought back down to a non-violating amount in the same transaction, or at least to the level they were when the transaction was initiated.

The caps are specified in terms of the underlying asset's units and are not converted to their ETH equivalents (for example).

### Operation pausing

Additionally, in order to give governance the ability to quickly react to market conditions, contract bugs, and other unpredictable events, assets can have operations "paused". This is intended to temporarily prevent a deposit/withdraw/etc operation from being performed on the asset.

### Mechanism

Caps and operation pausing are specified inside a new storage mapping `assetPolicies`. This mapping only needs to exist for assets that have policies configured. Whenever an operation is to be performed on an asset, its asset policies should be checked to ensure the operation is not paused, and also that the caps will not be exceeded.

For operations that cannot result in a cap being exceeded, the `assetPolicyCheck` function is used. This simply looks up the asset's policy and confirms the requested operation is not paused, throwing an exception if it is.

For operations that can result in a cap being exceeded, the pair of functions `assetPolicyDirty` and `assetPolicyClean` should be used instead. The first checks if the operation is paused as above, but also (if caps are configured) takes a snapshot of the `totalBalances` and `totalBorrows` of the asset and then marks the asset as "dirty", meaning it will need checking to validate it hasn't exceeded the caps. The operation is performed and then `assetPolicyClean` is called. This will either:

1. Verify the caps have not been exceeded (or at least are no more exceeded than when the snapshot was taken), and mark the asset clean
2. If the user has deferred liquidity checking, ensure that the user is entered into this market and then return, leaving the asset dirty

In the second case, the asset will have its caps verified and the assets marked dirty when the account's liquidity checking occurs. In this case, it will attempt to clean all markets the user has entered. Because of this, if a user attempts to exit a market, it must be cleaned first.

### Notes

* In order to leave space for future asset policy extensions without overflowing into a new storage slot, the supply and borrow caps have been packed uint `uint64` types. These represent the underlying units without decimals. So, a supply cap of 1 million on an 18 decimal place token would simply be stored as `1000000`, not `1000000 * 1e18`. This reduces the granularity of the caps because fractional units cannot be represented, but does not reduce the range, since asset amounts including decimals must fit within a `uint112` on the euler platform (the `MAX_SANE_AMOUNT` constant).
* The supply/borrow caps are effectively "first-come-first-serve" allocations. This means that it is possible for a user to deliberately perform a large deposit and/or borrow in order to max out the cap, thereby denying the ability of other users to participate in the market. This attack can be done in a relatively capital-efficient manner using self-collateralised loans. For this reason, governance should be careful with caps and should monitor activity on capped markets closely.
