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
* token SELFDESTRUCTS

## Price oracles

* Cause overflows in price calculations
  * Could lead to failures calculating liquidity

## Liquidations

* Self-liquidation
  https://medium.com/@mcateer/compounds-self-liquidation-bug-829d6571c2df
