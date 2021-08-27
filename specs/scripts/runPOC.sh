certoraRun \
  specs/poc/Euler.sol \
  specs/poc/EToken.sol \
  specs/poc/DToken.sol \
  specs/poc/RiskManager.sol \
  specs/poc/DummyERC20.sol \
  --link \
    Euler:dt=DToken \
    Euler:et=EToken \
    Euler:rm=RiskManager \
    Euler:dummyToken=DummyERC20 \
    EToken:rm=RiskManager \
    EToken:dummyToken=DummyERC20 \
  --verify \
    Euler:specs/EToken.spec \
  --cache euler_poc
  