if [ -z "$2" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [rule] [message describing the run]"
    exit 1
fi

make -C certora munged

certoraRun certora/harness/Harness.sol \
  certora/helpers/DummyERC20A.sol \
  --verify Harness:certora/spec/MarketsAssets.spec \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --rule $1
  --short_output \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "Markets and Assets $2" --staging \