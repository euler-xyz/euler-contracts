certoraRun \
  specs/harness/EulerStub.sol \
  specs/harness/ETokenHarness.sol \
  specs/harness/DTokenHarness.sol \
  specs/harness/RiskManagerHarness.sol \
  specs/harness/DummyERC20.sol \
  --link \
    EulerStub:dt=DTokenHarness \
    EulerStub:et=ETokenHarness \
    EulerStub:rm=RiskManagerHarness \
    EulerStub:ut=DummyERC20 \
    ETokenHarness:rm=RiskManagerHarness \
    ETokenHarness:ut=DummyERC20 \
    DTokenHarness:rm=RiskManagerHarness \
    DTokenHarness:ut=DummyERC20 \
  --verify \
    EulerStub:specs/EToken.spec \
  --rule sanity
  --optimistic_loop \
  --settings -useBitVectorTheory \
  --cache euler_etoken

  # --staging \
  
