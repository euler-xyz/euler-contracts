## amounts

`uint112`

* Maximum sane amount (result of balanceOf) for external tokens
* Uniswap2 limits token amounts to this
* Spec: For an 18 decimal token, more than a million billion tokens (1e15)

## small amounts

`uint96`

* For holding amounts that we don't expect to get quite as large, in particular reserve balances
* Can pack together with an address in a single slot
* Spec: For an 18 decimal token, more than a billion tokens (1e9)

## debt amounts

`uint144`

* Maximum sane amount for debts
* Packs together with an amount in a single storage slot
* Spec: Should hold the maximum possible amount (uint112) but scaled by another 9 decimal places (for the internal debt precision)
  * Actual: 2e16

## prices

A price is a fraction that represents how many reference asset units (WETH) you will get for each unit of an underlying.

*After* normalising the underlying asset's decimals to 18, prices fall within the range `1e-18` to `1e18`.

* For the purpose of liquidity calculation, prices below `1e-18` round up to `1e-18`, and prices above `1e18` round down to `1e18`.
* Due to precision loss, the practical range of prices on Euler is around `1e-15` through `1e15`. Assets with prices outside this range should be used with care (and certainly should have a zero collateral factor)
* Because price fractions are stored scaled by `1e18`, the internal representation of prices range from `1e0` to `1e36`
* To avoid overflows during liquidity calculations, the maximum supported price (in internal representation) times the maximum supported amount fits within a uint256: `2^112 * 1e36 ~= 5.2e69 < 1e77`

## interestRate

`int96`

* "Second Percent Yield"
* Fraction scaled by 1e27
  * Example: `10% APR = 1e27 * 0.1 / (86400*365) = 1e27 * 0.000000003170979198376458650 = 3170979198376458650`
* Spec: 1 billion % APR, positive or negative

## interestAccumulator

`uint256`

* Starts at 1e27, multiplied by (1e27 + interestRate) every second
* Spec: 100% APR for 100 years
      -> 2^256
      ~= 1.1579208923e+77
      -> 10^27 * (1 + (100/100 / (86400*365)))^(86400*365*100)
      ~= 2.6881128798e+70

## moduleId

`uint32`

* One per module, so this is way more than needed
* Divided into 3 sections
  * <500_000: Public single-proxy
  * >=500_000 and <1_000_000: Public multi-proxy
  * >=1_000_000: Internal
* Spec: A dozen or so modules, with room to grow in all sections

## collateralFactor/borrowFactor

`uint32`

* Fraction between 0 and 1, scaled by 2^32 - 1
* Spec: At least 3 decimal places (overkill)
