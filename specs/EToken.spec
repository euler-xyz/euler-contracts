// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// RUN ./specs/scripts/runEToken.sh

using ETokenHarness as eToken
using DTokenHarness as dToken
using DummyERC20 as underlying

methods {
  getUpgradeAdmin() returns address envfree;
  getModuleLookup(uint) returns address envfree;
  // computeInterestRate(address, uint) => ALWAYS(3170979198376458650);
  rm() returns address envfree;
  dt() returns address envfree;
  et() returns address envfree;
  ut() returns address envfree;
  et_proxyUnderlying(address) returns address envfree;
  dt_proxyUnderlying(address) returns address envfree;

  eToken.test_proxyAddr() returns address envfree;
  dToken.test_proxyAddr() returns address envfree;
}

definition MODULEID__RISK_MANAGER() returns uint256 = 1000000;
definition MODULEID__IRM_FIXED() returns uint256 = 2000002;

ghost msgSender() returns address;

function setupTokens() {
  require eToken == et();
  require dToken == dt();
  require underlying == ut();
  require underlying == et_proxyUnderlying(eToken.test_proxyAddr());
  require underlying == dt_proxyUnderlying(dToken.test_proxyAddr());
}

rule verify_setup(address account) {
  setupTokens();
  env e;

  assert et_underlying(e) == dt_underlying(e);
  uint etbu = et_balanceOfUnderlying(e, account);
  uint dtbu = dt_balanceOfUnderlying(e, account);
  assert etbu == dtbu, "balance mismatch"; 

  address etu = et_callerUnderlying(e);
  address dtu = dt_callerUnderlying(e);
  assert etu == ut() && etu == dtu, "underlying mismatch";
}

rule sanity(method f) {
    env e; calldataarg args;

    f(e,args);

    assert false;
}

// rule mint_is_symetrical(address a, uint amount) {
//   setupTokens();
//   env e;

//   require et_balanceOf(e, e.msg.sender) == 0;
//   require dt_balanceOf(e, e.msg.sender) == 0;
//   require getUnderlyingDecimals(e, eToken.proxyAddr()) == 18;

//   setupTokenStorage(e);

//   uint dec = et_callerDecimals(e);
//   assert dec == 18, "decimals";

//   et_mint(e, 0, amount);

//   uint eBalance = et_balanceOf(e, e.msg.sender);
//   assert eBalance == amount, "e-balance";

//   uint dBalance = dt_balanceOf(e, e.msg.sender);
//   assert eBalance == dBalance / 1000000000, "balance mismatch"; // division in solidity times out
// }


// rule test_internal() {
//   setup();

//   env e;
//   require e.msg.sender == msgSender();
//   address admin = getUpgradeAdmin();

//   assert testInternal(e) == admin, "not admin";
// }
