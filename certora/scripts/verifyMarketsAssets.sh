if [ -z "$2" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [contract] [message describing the run]"
    exit 1
fi

make -C certora munged

certoraRun certora/munged/modules/EToken.sol \
  certora/helpers/DummyERC20A.sol \
  certora/munged/Storage.sol \
  --verify EToken:certora/spec/MarketsAssets.spec \
  --solc solc8.0 \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "Markets and Assets" --staging