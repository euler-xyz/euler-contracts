certoraRun \
  specs/poc/Euler.sol \
  specs/poc/EToken.sol \
  specs/poc/DToken.sol \
  specs/poc/RiskManager.sol \
  --link \
    Euler:dt=DToken \
    Euler:et=EToken \
    Euler:rm=RiskManager \
    EToken:rm=RiskManager \
  --verify \
    Euler:specs/EToken.spec \
  --cache euler_poc
  