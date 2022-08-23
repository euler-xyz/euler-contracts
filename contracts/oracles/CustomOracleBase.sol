// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;


abstract contract CustomOracleBase {
    uint256 constant UPDATED_AT_TIMESTAMP_MASK = 0xffffffffffffffff;
    uint256 constant TWAP_WINDOW_MASK = 0xffffff0000000000000000;

    struct OracleRequest {
        address underlyingAsset;
        address quoteAsset;
        uint256 constraints;
        uint256 parameters;
    }

    struct OracleResponse {
        uint256 price;
        uint256 constraints;
    }

    function encodeConstraints(uint64 updatedAtTimestamp, uint24 twapWindow) internal pure returns (uint256) {
        return (uint(twapWindow) << 64) | updatedAtTimestamp;
    }

    function decodeConstraints(uint256 constraints) internal pure returns (uint64 updatedAtTimestamp, uint24 twapWindow) {
        updatedAtTimestamp = uint64(constraints);
        twapWindow = uint24((constraints & TWAP_WINDOW_MASK) >> 64);
    }

    function description() external pure virtual returns (string memory);
    function isSupported(address underlyingAsset, address quoteAsset, uint256 parameters) external view virtual returns (bool);
    function getPrice(OracleRequest memory request) external view virtual returns (OracleResponse memory);
}
