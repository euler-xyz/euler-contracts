// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// Run from /specs folder
// SOLC_VERSION=0.8.6 certoraRun  ./harness/ETokenHarness.sol:ETokenHarness ../contracts/modules/RiskManager.sol:RiskManager --link ETokenHarness:rm=RiskManager --verify ETokenHarness:EToken.spec --cache etoken
using EToken as eToken
using DToken as dToken
using DummyERC20 as underlying

methods {
  getUpgradeAdmin() returns address envfree;
  unpackTrailingParamMsgSender() => msgSender();
  getModuleLookup(uint) returns address envfree;
  // computeInterestRate(address, uint) => ALWAYS(3170979198376458650);
  rm() returns address envfree;
  dt() returns address envfree;
  et() returns address envfree;
  ut() returns address envfree;
  et_proxyUnderlying(address) returns address envfree;
  dt_proxyUnderlying(address) returns address envfree;
  eToken.proxyAddr() returns address envfree;
  dToken.proxyAddr() returns address envfree;
}

definition MODULEID__RISK_MANAGER() returns uint256 = 1000000;
definition MODULEID__IRM_FIXED() returns uint256 = 2000002;

ghost msgSender() returns address;
// ghost etProxyAddr() returns address;
// ghost dtProxyAddr() returns address;

function setupTokens() {
  // require getModuleLookup(MODULEID__RISK_MANAGER()) == rm();
  require eToken == et();
  require dToken == dt();
  require underlying == ut();
  require underlying == et_proxyUnderlying(eToken.proxyAddr());
  require underlying == dt_proxyUnderlying(dToken.proxyAddr());
}

// rule verify_setup(address account) {
//   setupTokens();
//   env e;
//   assert et_underlying(e) == dt_underlying(e);
//   uint etbu = et_balanceOfUnderlying(e, account);
//   uint dtbu = dt_balanceOfUnderlying(e, account);
//   assert etbu == dtbu, "balance mismatch"; 
//   address etu = et_callerUnderlying(e);
//   assert etu == ut(), "etoken underlying";
//   address dtu = et_callerUnderlying(e);
//   assert etu == dtu, "underlying mismatch";
// }


rule mint_is_symetrical(address a, uint amount) {
  setupTokens();
  env e;
  require e.msg.sender == msgSender();

  require et_balanceOf(e, e.msg.sender) == 0;
  require getUnderlyingDecimals(e, eToken.proxyAddr()) == 18;  
  uint dec = et_callerDecimals(e);
  assert dec == 18, "decimals";

  uint scaler = et_scaler(e);
  uint decimalsSet = et_decimalsSet(e);
  uint maxExternal = et_maxExternal(e);
  assert scaler == 1, "scaler";
  assert maxExternal == 0xffffffffffffffffffffffffffff, "max external";
  assert decimalsSet == dec, "decimals mismatch";

  et_mint(e, 0, amount);

  uint balance = et_balanceOf(e, e.msg.sender);
  uint balanceDirect2 = testBalanceDirect(e, e.msg.sender);
  assert balanceDirect2 == amount, "first";
  assert balance == amount, "second";

  // uint dBalance = dt_balanceOf(e, e.msg.sender);
  // assert balance == dBalance, "balance mismatch";
}


// rule test_internal() {
//   setup();

//   env e;
//   require e.msg.sender == msgSender();
//   address admin = getUpgradeAdmin();

//   assert testInternal(e) == admin, "not admin";
// }
