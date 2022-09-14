# Max Self-Collateralised Amounts

In order to determine how much an asset can be self-collateralised, we consider what state the account would be in if a `burn(MAX_UINT)` was performed on the eToken of the asset to be self-collateralised. This has the effect that at least one of the user's asset or liability amounts of this asset will be 0.

Given this "base" state, we can determine the maximum value for `mint()` that would succeed (ie, not cause a collateral violation). This value, called the "max self collateral" amount, is the value from the base state, not the user's current state. In order to find out how much additional can be minted from this amount, the minimum of the asset and liability amounts should be subtracted.

## Derivation

First of all, consider an account with "other collateral" (`OC`). This represents the risk-adjusted collateral value in assets *other than* the asset to be minted, normalised to the reference asset (ETH). For now, assume the account has no assets or liabilities in the self-collateralised asset.

All of the value of a mint is self-collateralised, except for `1-SCF`, where `SCF` is the self-collateral factor (`0.95`). This extra amount must be adjusted up by the asset's borrow factor (`BF`). Let `X` be the maximum mint value. The following equation relates the maximum mint amount (`X`) to `OC`:

    OC = X * (1 - SCF) / BF

Solving for X:

    X = OC * BF / (1 - SCF)

Now we will introduce the case where a user has either or both assets and liabilities in the self-collateralised asset, call these `SA` and `SL` respectively. Note that these are *not* risk-adjusted, but *are* normalised to the reference asset (ETH).

If after the burn there are outstanding liabilities (`SL > SA`), then this outstanding amount can be represented as `Math.max(0, SL - SA)`. This amount cannot be self-collateralised (because post-burn the self-collateralised assets would be 0). That means that this full amount must be adjusted up by the asset's borrow factor, and the available `OC` reduced by this amount. Plugging this into the previous equation gives:

    X = (OC - Math.max(0, SL - SA)/BF) * BF / (1 - SCF)

On the other hand, suppose that after the burn there are outstanding assets (`SA > SL`). This extra amount, represented as `Math.max(0, SA - SL)`, can be used to increase the maximum mint value according to the self-collateral factor. Because this additional asset will be itself used as self-collateral, the maximum amount of the extra mint that can be supported must subtract the collateral amount, so `1` must be subtracted from the multipler. For example, instead of multiplying by 20, we would multiply by 19 to make this extra amount fully self-collateralised. This gives:

    Math.max(0, SA - SL) * (1/(1 - SCF) - 1)

Adding the above onto the maximum mint amount equation gives our final function:

    X = (OC - Math.max(0, SL - SA)/BF) * BF / (1 - SCF) + Math.max(0, SA - SL) * (1/(1 - SCF) - 1)

Note: The above logic depends on the fact that the account has no other liabilities other than (potentially) an existing liability in the self-collateralised asset. We can make this assumption because self-collateralised borrows are always isolated.

## Usage

As mentioned, the value for `X` is the maximum amount that an account can mint after it performs a `burn(MAX_UINT)`. In order to display the remaining amount that is available to mint, we must subtract the amount that this virtual burn would eliminate from `X`:

    availToMint = X - Math.min(SA, SL)

In order to compute the account's current multiplier, we first need to know the maximum possible multiplier. This is a direct consequence of the SCF value. As described above, the SCF determines how much of a total position is eligible for self-collateralisation. This means that the starting value must be subtracted off when determining how much additional can be minted. In the case of a multiplier, the starting amount is `1` so this must be subtracted off:

    maxMultiplier = 1/(1 - SCF) - 1
                  = 1/0.05 - 1
                  = 20 - 1
                  = 19

So depending on the state of an account, its multiplier will lie between 0 and 19 (or technically higher, if it is in collateral violation). The current multiplier can be found by multiplying `maxMultiplier` by how much the current virtual burn amount is using out of the total `X` mint amount:

    currMultiplier = maxMultiplier * Math.min(SA, SL) / X
