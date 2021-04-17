## amounts

`uint112`

* Maximum sane amount (result of balanceOf) for external tokens
* Uniswap2 limits token amounts to this
* Spec: For an 18 decimal token, more than a million billion tokens (1e15)

## debt amounts

`uint144`

* Maximum sane amount for debts
* Packs together with an amount in a single storage slot
* Spec: Should hold the maximum possible amount (uint112) but scaled by another 9 decimal places (for the internal debt precision)
  * Actual: 2e16

## prices

* Minimum supported price:
  * Fraction: `1e3 / 1e18 = 1e-15`
  * Tick: `-345405`
  * sqrtPriceX96: `2505418623681149822473`

* Maximum supported price:
  * Fraction: `1e33 / 1e18 = 1e15`
  * Tick: `345405`
  * sqrtPriceX96: `2505410343826649584586222772852783278`

The supported price range was chosen for the following reason:

* The maximum price squared fits in a uint256: `6e73 < 1e77`
  * Not necessary to use FullMath library
* The maximum supported price times the maximum supported amount fits within a uint256: `5e66 < 1e77`
  * Also holds with debt and its extra 9 digits of precision: `5e75 < 1e77`

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
