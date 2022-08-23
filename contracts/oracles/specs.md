# Custom Oracles

A new pricing type `PRICINGTYPE__CUSTOM` is introduced within Euler to support cases in which already supported oracle types cannot easily return price of an asset or when certain type of processing/price sanitization is required before the price is passed into the Euler system. Custom oracles that provide this functionality must implement the `ICustomOracle` interface as well as follow the specification described here.

To better understand situations in which custom oracles might be needed let's consider the following scenarios:
* Uniswap V3 liquidity for a given asset does not exist and Chainlink oracle only returns price quoted in USD. In that case custom oracle may request Chainlink USD price of an asset as well as ETH/USD price and make necessary conversion.
* There is a high likelyhood that single source oracle (like Uniswap TWAP or Chainlink) may fail or may be manipulated. A custom oracle can mitigate that risk by querying multiple price oracles and further processing to determine which pricess are invalid.

## Requirements

### OracleRequest

Structure defining the price request:
```
struct OracleRequest {
    address underlyingAsset;
    address quoteAsset;
    uint256 constraints;
    uint256 parameters;
}
```

For assets on Ethereum network, their contract address should be used directly. If they do not have canonical address on Ethereum network (i.e. ETH, BTC), refer to the solidity [Denominations library](https://github.com/smartcontractkit/chainlink/blob/develop/contracts/src/v0.8/Denominations.sol) provided by Chainlink.

The fiat currencies encoding should be based on [ISO 4217](https://en.wikipedia.org/wiki/ISO_4217). I.e. USD encoding should equal to `address(840)` which corresponds to `0x0000000000000000000000000000000000000348`

### OracleResponse

Structure defining the oracle response:
```
struct OracleResponse {
    uint256 price;
    uint256 constraints;
}
```

## description

Returns the description of the oracle.

## isSupported

Returns true if price of given pair of underlying asset and quote asset is supported by the oracle.

### getPrice

Returns price of requested asset along with additional information.

Must meet the following requirements:
1. `OracleRequest.underlyingAsset` denotes an asset for which the price is requested
2. `OracleRequest.quoteAsset` denotes an asset in which requested price should be expressed
3. If requested pair of `OracleRequest.underlyingAsset` and `OracleRequest.quoteAsset` is not supported, the function should revert with the following error: `co/price-not-supported`
4. The `OracleRequest.constraints` denotes quality-related conditions the returned price should meet (depending on the internal implementation of the oracle).
Possible utilization includes instructing the oracle how price should be obtained (i.e. TWAP window used, minimal timestamp at which the price was updated). The information is encoded as follows:

|------------------------------------------------------uint256-constraints-------------------------------------------------------|
|---------------------------------unused---------------------------------|---uint24-twapWindow---|---uint64-updatedAtTimestamp---|

5. Usually, given oracle does not implement all the possible quality constraints. Hence, the function must check whether all the unimplemented `OracleRequest.constraints` are equal to 0. If any of them is not, the function should revert with `co/request-constraints-incorrect`
6. The `OracleRequest.parameters` denotes implementation-specific input parameters for the oracle (i.e. fee to calculate the uniswap pool used). This document does not specify how mentioned information should be encoded not to constrain the variety of solutions. 
7. If the function does not require any `OracleRequest.parameters`, it should ensure that `OracleRequest.parameters == 0`. If the condition not met, the function should revert with `co/request-parameters-incorrect`
8. The `OracleResponse.price` denotes returned price of requested asset expressed in requested quote asset/currency. The price must be normalized to 18 decimals precision
9. The `OracleResponse.price` of `0` is reserved to indicate the definitive oracle error and the processing of returned data must be ceased
10. The `OracleResponse.constraints` helps to indicate the validity of the returned price vs `OracleRequest.constraints` passed as an input. Thus, the consumer of the oracle (apart from checking if the price is non-zero) should only be required to check if `OracleResponse.constraints` are equal to `OracleRequest.constraints` to be sure that the price meets all the requirements.

I.e. if the `OracleRequest.constraints` requires certain freshness of the price, but the freshness criteria cannot be met, the `OracleResponse.constraints` should reflect that fact. If the price was updated at or after required timestamp, the `OracleResponse.constraints` returned are equal to `OracleRequest.constraints` requested and, as long as returned price is non-zero, the consumer can be certain that they received correct price. However, if the price was updated before required timestamp, the `OracleResponse.constraints` returned will not be equal to the `OracleRequest.constraints` and it's up to the consumer to decode the `OracleResponse.constraints` and decide whether the price returned should be used by the consumer system or not

11. As already stated, there is no requirement for the `OracleResponse.price` to be `0` when the `OracleResponse.constraints` and `OracleRequest.constraints` are not equal. The oracle consumer, upon asserting that the response constraints do not match request constraints, but the `OracleResponse.price` is non-zero, may decide to use the returned price for further processing by decoding the information contained in the response constraints. However, simple oracle that does not implement sophisticated failsafe logic, may set the price to `0` which invalidates `OracleResponse.constraints`. When returned price is `0`, the processing must be ceased

    | price > 0 | request constraints == response constraints |                      result
----|-----------|---------------------------------------------|------------------------------------------------------
 1. |    true   |                     true                    | price is valid and meets all the requested criteria
----|-----------|---------------------------------------------|------------------------------------------------------
 2. |    true   |                     false                   | proceed with care by analysing output parameters
----|-----------|---------------------------------------------|------------------------------------------------------
 3. |   false   |                      N/A                    | processing must be ceased
----|-----------|---------------------------------------------|------------------------------------------------------


oracle response processing pseudocode:

```
if price > 0 && response constraints == request constraints then
    we are sure the price is safe to be used
else if price > 0 && response constraints != request constraints then
    proceed with care. use response constraints to decide whether the price is valid for the use case or not
else 
    cease processing. return/revert
```

or

```
if price == 0 then
    cease processing. return/revert

if response constraints != request constraints then
    proceed with care. use response constraints to decide whether the price is valid for the use case or not

if reached here, we are sure that the price is safe to be used
```

## encodeConstraints

Convenience function for constraints encoding. Returns encoded constraints based on the inputs.

## decodeConstraints

Convenience function for constraints decoding. Returns decoded constraints components based on the inputs.



## Example

Let's assume that the custom oracle returns TWAP price of a given asset using Uniswap v3. The request/response constraints are defined as follows:

|---------------------------------unused---------------------------------|---uint24-twapWindow---|---uint64-updatedAtTimestamp---|

The `updatedAtTimestamp` constraint is not used used for this kind of oracle therefore should always be passed as 0.

The oracle requires user to pass the uniswap pool fee that is used to calculate the pool address for which the price is observed. For that the implementation-specific `OracleRequest.parameters` can be used.

Let's assume that we'd like to obtain UNI/WETH price from 0.3% pool with TWAP of 30 min (1800 sec). For that we make the following call:
`getPrice(OracleRequest(0x1f9840a85d5af5bf1d1762f925bdaddc4201f984, 0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2, 1800 << 64, 3000))`

If the requested pool does not exist, there's no meaningful price to be returned. In that case, the oracle should return price of `0`.
However, if requested pool exists, the oracle should observe uniswap price of requested time window. If the cardinality of the pool hasn't been increased or the pool has just been created and there's not enough data to compute the TWAP matching requested window, the oracle may still return meaningful price of lesser TWAP window and indicate that fact via `OracleResponse.constraints`.
