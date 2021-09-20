if [ -z "$1" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [message describing the run]"
    exit 1
fi

make -C certora munged

certoraRun certora/harness/ETokenHarness.sol \
  certora/helpers/DummyERC20A.sol \
  --verify ETokenHarness:certora/spec/MarketsAssets.spec \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "Markets and Assets" --staging
