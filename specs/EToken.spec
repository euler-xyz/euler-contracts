// NOTICE to make the rules pass currently,
// - hh console import needs to be removed from Base
// Run from /specs folder
// SOLC_VERSION=0.8.6 certoraRun  ./harness/ETokenHarness.sol:ETokenHarness ../contracts/modules/RiskManager.sol:RiskManager --link ETokenHarness:rm=RiskManager --verify ETokenHarness:EToken.spec --cache etoken

methods {
  getUpgradeAdmin() returns address envfree;
  unpackTrailingParamMsgSender() => msgSender();
}

ghost msgSender() returns address;
// ghost trailingParams() returns address, address;

rule test_link() {
  env e;
  require e.msg.sender == msgSender();
  address admin = getUpgradeAdmin();

  assert testLink(e) == admin, "not admin";
}


// rule get_name() {
//   env e;

// }