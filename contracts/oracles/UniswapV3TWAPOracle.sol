// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "./CustomOracleBase.sol";
import "../lib/UniswapV3TWAP.sol";

interface IERC20 {
    function decimals() external pure returns (uint8);
}

contract UniswapV3TWAPOracle is CustomOracleBase {
    address immutable public uniswapFactory;
    bytes32 immutable public uniswapPoolInitCodeHash;

    constructor(address _uniswapFactory, bytes32 _uniswapPoolInitCodeHash) {
        uniswapFactory = _uniswapFactory;
        uniswapPoolInitCodeHash = _uniswapPoolInitCodeHash;
    }

    function description() external pure override returns (string memory) {
        return "Uniswap V3 TWAP Oracle";
    }

    function isSupported(address underlyingAsset, address quoteAsset, uint256 fee) external view override returns (bool) {
        return IUniswapV3Factory(uniswapFactory).getPool(underlyingAsset, quoteAsset, uint24(fee)) != address(0);
    }

    function getPrice(OracleRequest memory request) external view override returns (OracleResponse memory) {
        (uint64 updatedAtTimestamp, uint24 twapWindow) = decodeConstraints(request.constraints);

        require(updatedAtTimestamp == 0, "co/request-constraints-incorrect");

        address pool = UniswapV3TWAP.computeUniswapPoolAddress(uniswapFactory, uniswapPoolInitCodeHash, request.underlyingAsset, request.quoteAsset, uint24(request.parameters));
        (uint sqrtPriceX96, uint finalAgo) = UniswapV3TWAP.uniswapObserve(pool, twapWindow);

        uint underlyingDecimalsScaler = 10**(18 - IERC20(request.underlyingAsset).decimals());

        return OracleResponse(
            decodeSqrtPriceX96(request.underlyingAsset, request.quoteAsset, underlyingDecimalsScaler, sqrtPriceX96),
            encodeConstraints(0, uint24(finalAgo))
        );
    }

    function findBestUniswapPool(address factory, address underlying, address referenceAsset) external view returns (address pool, uint24 fee) {
        return UniswapV3TWAP.findBestUniswapPool(factory, underlying, referenceAsset);
    }

    function decodeSqrtPriceX96(address underlyingAsset, address quoteAsset, uint underlyingDecimalsScaler, uint sqrtPriceX96) private pure returns (uint price) {
        if (uint160(underlyingAsset) < uint160(quoteAsset)) {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / 1e18) / underlyingDecimalsScaler;
        } else {
            price = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, uint(2**(96*2)) / (1e18 * underlyingDecimalsScaler));
            if (price == 0) return 1e36;
            price = 1e36 / price;
        }

        if (price > 1e36) price = 1e36;
        else if (price == 0) price = 1;
    }
}