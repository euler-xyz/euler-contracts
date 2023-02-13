// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;


interface IChainlinkAggregatorV2V3 {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestAnswer() external view returns (int256);
    function latestTimestamp() external view returns (uint256);
}

interface IRETH {
    function getExchangeRate() external view returns (uint256);
}

/// @notice Provides rETH/ETH price using rETH/ETH exchange rate provided by rETH smart contract
contract RETHOracle is IChainlinkAggregatorV2V3 {
    address immutable public rETH;

    constructor(
        address _rETH
    ) {
        //rETH = 0xae78736Cd615f374D3085123A210448E74Fc6393;

        rETH = _rETH;
    }

    function decimals() external pure override returns (uint8) {
        return 18;
    }

    function description() external pure override returns (string memory) {
        return "RETH / ETH";
    }

    function latestTimestamp() external view override returns (uint256) {
        return block.timestamp;
    }

    /// @notice Get rETH/ETH price.
    /// @return answer rETH/ETH price or 0 if failure
    function latestAnswer() external view override returns (int256 answer) {
        // get rETH/ETH exchange rate
        return int256(IRETH(rETH).getExchangeRate());
    }
}
