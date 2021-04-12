This document is a non-comprehensive list of attacker models to consider during design.

## Creating eTokens

* Creating eTokens with hostile token
* eToken that uses another eToken as underlying

## Hostile Tokens

* Change name or symbol
* Change decimals
* Arbitrarily change balance of the eToken
  * Sometimes legitimate tokens can charge fees on transfer (see compound's doTransferIn)
  * Some tokens are deflationary (or inflationary, ie aTokens)
* Make methods like balanceOf() or transfer() fail
  * Could prevent liquidations
* Make methods like balanceOf() consume excessive gas
* Cause overflows in amounts
  * Could lead to failures calculating liquidity
  * Token with balance just under the limit, and then interest is accrued and it goes over
* token SELFDESTRUCTS

## Gas

* In callBalanceOf(), we proceed even when a call to a token fails due to out of gas condition.
  An attacker could carefully choose a gasLimit to cause this to return 0 for an honest token
  that in fact has a non-zero balance.

## Price oracles

* Cause overflows in price calculations
  * Could lead to failures calculating liquidity
  * When liquidity is exhausted, attacker can manipulate the price arbitrarily
    Noah 26/03/2021: i agree with your first point! re. what happens once the entire order book is eaten up, you can freely continue in the "same direction" for 0 cost (other than gas), meaning you can manipulate the price for free up to the limit. is your worry that this could be used to oracle attack?
    moody 26/03/2021: you can also consider using the time weighted average liquidity to throw out prices when the liquidity is less than some deviation from the mean (this is a tricky problem though)
  * Spam orders at every tick to cause gas usage to liquidate too high
    * Noah thinks this isn't a problem: liquidity should congregate to pools with tick spacing proportional to volatility. ticks are in log space, so the more ticks are crossed, the more price impact you eat. we expect the median swap to cross ~0 - ~2 ticks. each tick crossing is like a ~40k gas overhead iirc


## Liquidations

* Self-liquidation
  https://medium.com/@mcateer/compounds-self-liquidation-bug-829d6571c2df
