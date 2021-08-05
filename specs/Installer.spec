// definition MAX_EXTERNAL_SINGLE_PROXY_MODULEID() returns uint256 = 499999;

// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// - MAX_POSSIBLE_ENTERED_MARKETS must be set to lower number e.g. 100 - pending prover bugfix
// A fix to ALWAYS summary return size bug is pending. Then the installModules can be further analyzed 
// with BaseModule(a).moduleId() external call summarized 
// Run from spec folder
// certoraRun --optimistic_loop ./harness/InstallerHarness.sol:InstallerHarness  --verify InstallerHarness:Installer.spec

methods {
  getUpgradeAdmin() returns address envfree;
  getGovernorAdmin() returns address envfree;
  moduleId() => DISPATCHER(true);
  requireCodesize(address) returns bool envfree;
  getModuleLookup(uint) returns address envfree;
  getProxyLookup(uint) returns address envfree;
  unpackTrailingParamMsgSender() => ghostSender();
}

ghost ghostSender() returns address;

rule only_upgrade_admin_can_set_governor_admin(address a) {
  env e;
  require e.msg.sender == ghostSender();
  require e.msg.value == 0;
  address admin = getUpgradeAdmin();

  setGovernorAdmin@withrevert(e, a);
  bool ok = !lastReverted;

  assert !ok <=> (e.msg.sender != admin || a == 0), "did revert";
  
  require ok;
  assert getGovernorAdmin() == a, "new admin not set";
}

rule only_upgrade_admin_can_install_modules(address[] newModules) {
  env e;
  require e.msg.sender == ghostSender();
  require e.msg.value == 0;

  // this causes internal exception in certora
  // require forall uint i. requireCodesize(newModules[i]) == true;

  require newModules.length == 2;
  // filters out addresses that are not contracts
  // on BaseModule(a).moduleId() extcodesize check would fail
  // before summarization kicks in
  requireCodesize(newModules[0]);
  requireCodesize(newModules[1]);


  address admin = getUpgradeAdmin();

  // filters out branches calling new Proxy() 
  require forall uint i. getProxyLookup(i) > 0;

  installModules@withrevert(e, newModules);
  bool ok = !lastReverted;
  
  // bidirectional implication possible only when all other 
  // revert branches are filtered out
  assert e.msg.sender != admin => !ok, "did revert";
}

// rule revert_on_gas(address[] a) {
//   env e;
//   consumeGas(e, a);
//   assert !lastReverted;
// }