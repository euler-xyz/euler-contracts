
make -C certora munged

certoraRun \
    certora/harness/ETokenHarness.sol \
    certora/helpers/DummyERC20A.sol   \
    --verify ETokenHarness:certora/spec/common.spec \
    --rule sanity                       \
    --solc solc8.0                      \
    --solc_args '["--optimize"]' \
    --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true   \
    --msg "sanity $1"                   \
    --staging


