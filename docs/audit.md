## Areas of concern

* Proxy/module implementation is fairly novel, so would appreciate sanity checking that
* Hostile tokens that cause liquidity checks to fail could allow an attacker to prevent their own liquidation:
  * callBalanceOf() should return 0 on any sort of failure and not abort tx
  * extreme prices on uniswap pools could cause integer overflows during liquidity computation
    * we're planning to saturate prices, but this is not yet implemented
* Deferred liquidity checks are how we're implementing flash loans, which is a bit unusual and could use checking

## Implementations in progress

* The fallback code for when uniswap3 doesn't have an old enough accumulator is currently untested
  * Need to finish uniswap pool mock first
* Liquidations aren't yet well tested
* Our production interest rate model is still being worked on, and is not yet committed
