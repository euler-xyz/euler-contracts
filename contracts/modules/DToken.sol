// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";




/// @notice Tokenised representation of debts
contract DToken is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__DTOKEN, moduleGitCommit_) {}

    function CALLER() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        address eTokenAddress = dTokenLookup[proxyAddr];
        require(eTokenAddress != address(0), "e/unrecognized-dtoken-caller");
        assetStorage = eTokenLookup[eTokenAddress];
        underlying = assetStorage.underlying;
    }


    // Events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);



    // External methods

    /// @notice Debt token name, ie "Euler Debt: DAI"
    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Debt: ", IERC20(underlying).name()));
    }

    /// @notice Debt token symbol, ie "dDAI"
    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("d", IERC20(underlying).symbol()));
    }

    /// @notice Decimals of underlying
    function decimals() external view returns (uint8) {
        (,AssetStorage storage assetStorage,,) = CALLER();
        return assetStorage.underlyingDecimals;
    }

    /// @notice Address of underlying asset
    function underlyingAsset() external view returns (address) {
        (address underlying,,,) = CALLER();
        return underlying;
    }

    /// @notice Debt owed by a particular account, in underlying units
    function balanceOf(address account) external view returns (uint) {
        if (optInTokenBurn[account].dToken) return 0;
        else revert();
    }

    /// @notice Debt owed by a particular account, in underlying units normalized to 27 decimals
    function balanceOfExact(address account) external view returns (uint) {
        if (optInTokenBurn[account].dToken) return 0;
        else revert();
    }

    function burnDTokens(uint subAccountId) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        if (optInTokenBurn[account].dToken) return;

        optInTokenBurn[account].dToken = true;

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);
        uint owed = getCurrentOwed(assetStorage, assetCache, account);

        if (owed == 0) return;

        emitViaProxy_Transfer(proxyAddr, account, address(0), owed);
    }
}
