pragma solidity ^0.8.0;

import "../munged/modules/EToken.sol";

contract ETokenHarness is EToken{
    // These functions are implemented by calling the corresponding methods on
    // the underlying currency, but they have the same abi signatures as the
    // methods we want to summarize, so CVT is tripping.
    function name()   virtual override external view returns (string memory) { return ""; }
    function symbol() virtual override external view returns (string memory) { return ""; }
}
