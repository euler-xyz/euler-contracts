
certoraRun \
    specs/harness/ETokenHarness.sol     \
    --verify ETokenHarness:certora/EToken.spec \
    --rule sanity \
    --solc solc8.0                      \
    --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true   \
    --msg "sanity $1"    \
    --staging


