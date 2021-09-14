
make -C certora munged

certoraRun \
    certora/munged/modules/EToken.sol   \
    --verify EToken:certora/common.spec \
    --solc solc8.0                      \
    --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true   \
    --msg "sanity $1"                   \
    --staging


