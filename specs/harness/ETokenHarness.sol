pragma solidity ^0.8.0;

import "./BaseHarness.sol";
import "../../contracts/modules/EToken.sol";

contract ETokenHarness is EToken, BaseHarness {
    address public constant proxyAddr = address(1);

    function test_proxyAddr() public pure returns (address) {
        return proxyAddr;
    }

    function test_balanceOfUnderlying(address account) external view returns (uint) {
        return IERC20(ut).balanceOf(account);
    }

    function test_callerUnderlying() external view returns (address underlying) {
        (underlying,,,) = CALLER();
    }

    function test_callerDecimals() public view returns (uint) {
        (, AssetStorage storage assetStorage,,) = CALLER();
        return assetStorage.underlyingDecimals;
    }

    function test_getUnderlying() public view returns (address) {
        return eTokenLookup[proxyAddr].underlying;
    }

    // OVERRIDES

    function CALLER() override internal view returns (address, AssetStorage storage, address, address) {
        (address msgSender,) = unpackTrailingParams();
        AssetStorage storage assetStorage = eTokenLookup[proxyAddr];
        address underlying = assetStorage.underlying;
        require(underlying != address(0), "e/unrecognized-etoken-caller");
        return (underlying, assetStorage, proxyAddr, msgSender);
    }

    function callInternalModule(uint moduleId, bytes memory input) override(Base, BaseHarness) internal returns (bytes memory) {
        return BaseHarness.callInternalModule(moduleId, input);
    }

    function unpackTrailingParamMsgSender() override internal view returns (address msgSender) {
        return msg.sender;
    }

    function unpackTrailingParams() override internal view returns(address, address) {
        return (msg.sender, address(0));
    }

    function emitViaProxy_Transfer(address, address, address, uint) internal override {}

    function emitViaProxy_Approval(address, address, address, uint) internal override {}
    
    function callBalanceOf(AssetCache memory, address account) internal view override returns (uint) {
        return IERC20(ut).balanceOf(account);
    }

    function decodeExternalAmount(uint underlyingDecimals, uint externalAmount) internal pure returns (uint scaledAmount) {
        uint underlyingDecimalsScaler = 10**(18 - underlyingDecimals);
        uint maxExternalAmount = MAX_SANE_AMOUNT / underlyingDecimalsScaler;
        require(externalAmount <= maxExternalAmount, "e/amount-too-large");
        unchecked { scaledAmount = externalAmount * underlyingDecimalsScaler; }
    }
}