## Asset Policies

### Supply/Borrow caps

For some assets it is desired to limit the amount of assets supplied and/or borrowed on the platform. This could be done in order to phase-in a collateral asset while minimising exposure to the protocol. An asset may also have a limited amount of on-chain liquidity, which could merit capping the lending/borrowing activity.

While it is possible for governance to lower a cap to below the current supply/borrow level, caps are not intended to function as emergency pause mechanisms. It should still be possible to withdraw/repay, even when an asset is in violation of the cap. This should be true even if your withdraw/repay is insufficient to solve the violation, and the asset's supply/borrow remains above your the cap after your operation.

Furthermore, it should be possible to temporarily exceed the cap, as long as the supply/borrows are brought back down to a non-violating amount in the same transaction, or at least to the level they were when the transaction was initiated.

### Operation pausing

In order to give governance an ability to quickly react to market conditions, contract bugs, and other unpredictable events, assets can have operations "paused". This is intended to temporarily prevent a deposit/withdraw/etc operation from being performed on the asset.

### Mechanism

Caps and operation pausing are specified inside a new storage mapping `assetPolicies`. This mapping only needs to exist for assets that have policies configured.

Whenever an operation is to be performed on an asset, its asset policies should be checked to ensure the operation is not paused, and also that the caps will not be exceeded.





TODO:
  * Testing
    * Alternate decimals
    * Exchange rate != 1
    * Pause bitmask
  * Add pause checks to places that need them
    * new pause checks?
  * optimisations
