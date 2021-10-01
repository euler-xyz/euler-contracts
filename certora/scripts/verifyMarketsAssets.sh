if [ -z "$2" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [contract] [message describing the run]"
    exit 1
fi

CONTRACT=$1
MSG=$2
shift 2

make -C certora munged

certoraRun ${CONTRACT} \
  certora/helpers/DummyERC20A.sol \
  --verify $(basename ${CONTRACT} .sol):certora/spec/MarketsAssets.spec \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --rule $1 \
  --short_output \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "Markets and Assets ${MSG}" --staging \
  $*

