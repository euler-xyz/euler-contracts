// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// Run from /specs folder
// certoraRun --loop_iter=2 ./harness/InstallerHarness.sol:InstallerHarness --verify InstallerHarness:Installer.spec

methods {
  getUpgradeAdmin() returns address envfree;
  getGovernorAdmin() returns address envfree;
  moduleId() => ALWAYS(1);
  requireCode(address) envfree;
  getModuleLookup(uint) returns address envfree;
  getProxyLookup(uint) returns address envfree;
  unpackTrailingParamMsgSender() => msgSender();
}

ghost msgSender() returns address;

rule only_upgrade_admin_can_set_governor_admin(address a) {
  env e;
  require e.msg.sender == msgSender();
  require e.msg.value == 0;

  setGovernorAdmin@withrevert(e, a);
  bool ok = !lastReverted;

  assert !ok <=> (e.msg.sender != getUpgradeAdmin() || a == 0), "did revert";
  
  require ok;
  assert getGovernorAdmin() == a, "new admin not set";
}

rule only_upgrade_admin_can_install_modules(address[] newModules) {
  env e;
  require e.msg.sender == msgSender();
  require e.msg.value == 0;

  // this causes internal exception in certora
  // require forall uint i. requireCode(newModules[i]) == true;

  require newModules.length == 2;
  // filters out addresses that are not contracts
  // on BaseModule(a).moduleId() extcodesize check would fail
  // before summarization kicks in
  requireCode(newModules[0]);
  requireCode(newModules[1]);

  // filters out branches calling new Proxy() 
  require forall uint i. getProxyLookup(i) > 0;

  installModules@withrevert(e, newModules);
  bool ok = !lastReverted;
  
  assert e.msg.sender != getUpgradeAdmin() <=> !ok, "did revert";

  require ok;
  // since moduleId() is ALWAYS(1), the last module in the array should be set
  assert getModuleLookup(1) == newModules[1];
}