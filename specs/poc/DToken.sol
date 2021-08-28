pragma solidity ^0.8.0;

import "./BasePOC.sol";

contract DToken is BasePOC {
    constructor() BaseModule(MODULEID__DTOKEN) {}

    address public constant proxyAddr = address(2);
    // TODO override this
    function CALLER() private view returns (address, AssetStorage storage, address, address) {
        (address msgSender, ) = unpackTrailingParams();
        address eTokenAddress = dTokenLookup[proxyAddr];
        require(eTokenAddress != address(0), "e/unrecognized-dtoken-caller");
        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        address underlying = assetStorage.underlying;

        return (underlying, assetStorage, proxyAddr, msgSender);
    }

    // function balanceOf(address account) external view returns (uint) {
    //     (address underlying, AssetStorage storage assetStorage,,) = CALLER();
    //     AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

    //     return getCurrentOwed(assetStorage, assetCache, account) / assetCache.underlyingDecimalsScaler;
    // }

    function getUnderlying() public view returns (address) {
        return eTokenLookup[dTokenLookup[proxyAddr]].underlying;
    }

    // function balanceOfUnderlying(address account) external view returns (uint) {
    //     (address underlying, AssetStorage storage assetStorage,,) = CALLER();
    //     AssetCache memory assetCache = loadAssetCacheRO(underlying, assetStorage);

    //     return balanceToUnderlyingAmount(assetCache, assetStorage.users[account].balance) / assetCache.underlyingDecimalsScaler;
    // }

    function test_balanceOfUnderlying(address account) external view returns (uint) {
        return IERC20(ut).balanceOf(account);
    }

    function test_callerUnderlying() external view returns (address underlying) {
        (underlying,,,) = CALLER();
    }
}