pragma solidity ^0.8.0;

import "../../contracts/BaseLogic.sol";

abstract contract BaseHarness is BaseLogic {

    // These are workarounds to the lack of struct support in CVL
    // There should be one accessor for each field of AssetStorage
    function et_lastInterestAccumulatorUpdate (address eToken) public view returns uint40  { return eTokenLookup[token].lastInterestAccumulatorUpdate ; }
    function et_underlyingDecimals            (address eToken) public view returns uint8   { return eTokenLookup[token].underlyingDecimals            ; }
    function et_interestRateModel             (address eToken) public view returns uint32  { return eTokenLookup[token].interestRateModel             ; }
    function et_interestRate                  (address eToken) public view returns int96   { return eTokenLookup[token].interestRate                  ; }
    function et_reserveFee                    (address eToken) public view returns uint32  { return eTokenLookup[token].reserveFee                    ; }
    function et_pricingType                   (address eToken) public view returns uint16  { return eTokenLookup[token].pricingType                   ; }
    function et_pricingParameters             (address eToken) public view returns uint32  { return eTokenLookup[token].pricingParameters             ; }
    function et_underlying                    (address eToken) public view returns address { return eTokenLookup[token].underlying                    ; }
    function et_reserveBalance                (address eToken) public view returns uint96  { return eTokenLookup[token].reserveBalance                ; }
    function et_dTokenAddress                 (address eToken) public view returns address { return eTokenLookup[token].dTokenAddress                 ; }
    function et_totalBalances                 (address eToken) public view returns uint112 { return eTokenLookup[token].totalBalances                 ; }
    function et_totalBorrows                  (address eToken) public view returns uint144 { return eTokenLookup[token].totalBorrows                  ; }
    function et_interestAccumulator           (address eToken) public view returns uint    { return eTokenLookup[token].interestAccumulator           ; }

    function et_user_balance             (address eToken, address user) public view returns uint112 { return eTokenLookup[token].users[user].balance            ; }
    function et_user_owed                (address eToken, address user) public view returns uint144 { return eTokenLookup[token].users[user].owed               ; }
    function et_user_interestAccumulator (address eToken, address user) public view returns uint    { return eTokenLookup[token].users[user].interestAccumulator; }
    function et_eTokenAllowance (address eToken, address a, address b)  public view returns uint    { return eTokenLookup[token].eTokenAllowance[a][b]          ; }
    function et_dTokenAllowance (address eToken, address a, address b)  public view returns uint    { return eTokenLookup[token].dTokenAllowance[a][b]          ; }

    // overridden functions ////////////////////////////////////////////////////

    bytes cim_result;
    function callInternalModule(uint moduleId, bytes memory input) virtual internal returns (bytes memory) {
        return cim_result;
    }

}

contract DTokenHarness      is DToken,      BaseHarness {}
contract ETokenHarness      is EToken,      BaseHarness {}
contract InstallerHarness   is Installer,   BaseHarness {}
contract LiquidationHarness is Liquidation, BaseHarness {}
contract MarketsHarness     is Markets,     BaseHarness {}
contract RiskManagerHarness is RiskManager, BaseHarness {}

