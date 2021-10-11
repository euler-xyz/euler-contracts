if [ -z "$1" ]
  then
    echo "No message given!"
    echo "Usage: (from git root)"
    echo "./certora/scripts/`basename $0` [message describing the run]"
    exit 1
fi

make -C certora munged

certoraRun certora/harness/Harness.sol \
  certora/helpers/DummyERC20A.sol \
  --verify Harness:${SPEC} \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --short_output \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "Markets and Assets $1" --staging \

SPEC=certora/spec/MarketsAssets.spec

# if [ -z "$2" ]
#   then
#     echo "No message given!"
#     echo "Usage: (from git root)"
#     echo "./certora/scripts/`basename $0` [rule] [message describing the run]"
#     echo "possible rules:"
#     # TODO: this is pretty terrible:
#     grep "^rule\|^invariant" ${SPEC} \
#         | sed 's/^[a-z]* \(.*\)*(.*$/  \1/'
#     exit 1
# fi