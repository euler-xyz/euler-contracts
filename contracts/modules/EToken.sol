// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";


/// @notice Tokenised representation of assets
contract EToken is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__ETOKEN, moduleGitCommit_) {}

    function CALLER() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        assetStorage = eTokenLookup[proxyAddr];
        underlying = assetStorage.underlying;
        require(underlying != address(0), "e/unrecognized-etoken-caller");
    }


    // Events

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);



    // External methods

    /// @notice Pool name, ie "Euler Pool: DAI"
    function name() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("Euler Pool: ", IERC20(underlying).name()));
    }

    /// @notice Pool symbol, ie "eDAI"
    function symbol() external view returns (string memory) {
        (address underlying,,,) = CALLER();
        return string(abi.encodePacked("e", IERC20(underlying).symbol()));
    }

    /// @notice Decimals, always normalised to 18.
    function decimals() external pure returns (uint8) {
        return 18;
    }

    /// @notice Address of underlying asset
    function underlyingAsset() external view returns (address) {
        (address underlying,,,) = CALLER();
        return underlying;
    }

    /// @notice Balance of a particular account, in internal book-keeping units (non-increasing)
    function balanceOf(address account) external view returns (uint) {
        if (optInTokenBurn[account].eToken || isERC4626WrapperAccount(account)) return 0;
        else revert();
    }

    /// @notice Balance of a particular account, in underlying units (increases as interest is earned)
    function balanceOfUnderlying(address account) external view returns (uint) {
        if (optInTokenBurn[account].eToken || isERC4626WrapperAccount(account)) return 0;
        else revert();
    }

    function burn(uint subAccountId) external nonReentrant {
        (, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER();
        address account = getSubAccount(msgSender, subAccountId);

        if (optInTokenBurn[account].eToken) return;

        optInTokenBurn[account].eToken = true;

        uint amount = assetStorage.users[account].balance;

        if (amount == 0) return;

        emitViaProxy_Transfer(proxyAddr, account, address(0), amount);
    }

    function isERC4626WrapperAccount(address account) internal pure returns (bool) {
        return account == 0x60897720AA966452e8706e74296B018990aEc527 ||
            account == 0x3c66B18F67CA6C1A71F829E2F6a0c987f97462d0 ||
            account == 0x20706baA0F89e2dccF48eA549ea5A13B9b30462f;
    }
}
