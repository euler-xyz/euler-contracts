certoraRun \
  specs/poc/Euler.sol \
  specs/poc/EToken.sol \
  specs/poc/DToken.sol \
  --link \
    Euler:dt=DToken \
    Euler:et=EToken \
    EToken:dt=DToken \
  --verify \
    Euler:specs/EToken.spec \
  --cache euler_poc
  