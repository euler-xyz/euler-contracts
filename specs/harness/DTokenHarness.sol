pragma solidity ^0.8.0;

import "./BaseHarness.sol";
import "../../contracts/modules/DToken.sol";

contract DTokenHarness is DToken, BaseHarness {
    address public constant proxyAddr = address(2);

    function test_proxyAddr() public pure returns (address) {
        return proxyAddr;
    }

    function test_getUnderlying() public view returns (address) {
        return eTokenLookup[dTokenLookup[proxyAddr]].underlying;
    }

    function test_balanceOfUnderlying(address account) external view returns (uint) {
        return IERC20(ut).balanceOf(account);
    }

    function test_callerUnderlying() external view returns (address underlying) {
        (underlying,,,) = CALLER();
    }

    // OVERRIDES

    function CALLER() override internal view returns (address, AssetStorage storage, address, address) {
        (address msgSender, ) = unpackTrailingParams();
        address eTokenAddress = dTokenLookup[proxyAddr];
        require(eTokenAddress != address(0), "e/unrecognized-dtoken-caller");
        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        address underlying = assetStorage.underlying;

        return (underlying, assetStorage, proxyAddr, msgSender);
    }

    function callInternalModule(uint moduleId, bytes memory input) override(Base, BaseHarness) internal returns (bytes memory) {
        return BaseHarness.callInternalModule(moduleId, input);
    }

    function unpackTrailingParams() override internal view returns(address, address) {
        return (msg.sender, address(0));
    }

    function unpackTrailingParamMsgSender() override internal view returns (address msgSender) {
        return msg.sender;
    }

    function emitViaProxy_Transfer(address, address, address, uint) internal override {}

    function emitViaProxy_Approval(address, address, address, uint) internal override {}
    
    function callBalanceOf(AssetCache memory, address account) internal view override(BaseLogic) returns (uint) {
        return IERC20(ut).balanceOf(account);
    }

    function decodeExternalAmount(uint underlyingDecimals, uint externalAmount) internal pure returns (uint scaledAmount) {
        uint underlyingDecimalsScaler = 10**(18 - underlyingDecimals);
        uint maxExternalAmount = MAX_SANE_AMOUNT / underlyingDecimalsScaler;
        require(externalAmount <= maxExternalAmount, "e/amount-too-large");
        unchecked { scaledAmount = externalAmount * underlyingDecimalsScaler; }
    }
}