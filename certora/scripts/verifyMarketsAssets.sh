spec=certora/spec/MarketsAssets.spec

if [ -z "$3" ]
  then
    echo "Incorrect number of arguments"
    echo ""
    echo "Usage: (from git root)"
    echo "  ./certora/scripts/`basename $0` [contract] [rule] [message describing the run]"
    echo ""
    echo "possible contracts:"
    ls -p certora/munged/modules | grep -v / | xargs basename -s .sol | sed 's/\(.*\)/  \1/g'
    echo ""
    echo "possible rules:"
    # TODO: this is pretty terrible:
    grep "^rule\|^invariant" ${spec} \
        | sed 's/^[a-z]* \(.*\)*(.*$/  \1/'
    exit 1
fi

contract=$1
rule=$1
msg=$3
shift 3

make -C certora munged

certoraRun certora/munged/modules/${contract}.sol \
  certora/helpers/DummyERC20A.sol \
  --verify ${contract}:${spec} \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --rule ${rule} \
  --short_output \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true \
  --loop_iter 1 --optimistic_loop \
  --msg "M and A ${contract} ${rule} ${msg}" --staging \
  $*

