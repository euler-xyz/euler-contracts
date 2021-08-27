# certoraRun specs/harness/EulerHarness.sol -- verify specs/EToken.spec
  
certoraRun \
  specs/harness/EulerHarness.sol \
  specs/harness/ETokenHarness.sol \
  specs/harness/DTokenHarness.sol \
  specs/harness/RiskManagerHarness.sol \
  --link \
    EulerHarness:rm=RiskManagerHarness \
    EulerHarness:dt=DTokenHarness \
    EulerHarness:et=ETokenHarness \
  --verify \
    EulerHarness:specs/EToken.spec \
  --cache euler_etoken
  