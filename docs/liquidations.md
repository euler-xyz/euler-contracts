## Liquidations

* One potential issue: If an account has a health score so low that a partial liquidation can actually reduce the user's health score, then a liquidator might deliberately do a small partial liquidation. Because this reduces the user's health score, it could actually increase the discount the liquidator receives on subsequent liquidations. The liquidator could do this in a smart contract and iteratively increase the discount higher and higher.
  * Possible mitigation: After the first liquidation, set a max discount that will be in effect for the next N seconds. Even N=1 would be sufficient to force a liquidator to wait until the subsequent block, which would give competitors a chance to perform the liquidations also, which would disincentivise this attack.
