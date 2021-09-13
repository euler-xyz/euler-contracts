
make -C certora munged

certoraRun
    certora/munged/modules/EToken.sol
    --verify EToken:certora/EToken.spec
    --solc solc8.0
    --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true
    --rule sanity
    --msg "sanity"
    --staging

