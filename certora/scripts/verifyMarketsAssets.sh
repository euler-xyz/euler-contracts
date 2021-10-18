spec=certora/spec/MarketsAssets.spec

if [ -z "$2" ]
  then
    echo "Incorrect number of arguments"
    echo ""
    echo "Usage: (from git root)"
    echo "  ./certora/scripts/`basename $0` [contract] [message describing the run]"
    echo ""
    echo "Possible contracts:"
    ls -p certora/munged/modules | grep -v / | xargs basename -s .sol | sed 's/\(.*\)/  \1/g'
    exit 1
fi

contract=$1
msg=$2
shift 2

make -C certora munged

certoraRun certora/munged/modules/${contract}.sol \
  certora/helpers/DummyERC20A.sol \
  certora/munged/modules/EToken.sol   \
  --verify ${contract}:${spec} \
  --solc solc8.0 \
  --solc_args '["--optimize"]' \
  --disableLocalTypeChecking \
  --short_output \
  --settings -postProcessCounterExamples=true,-enableStorageAnalysis=true,-enableGhostGrounding=true \
  --loop_iter 1 --optimistic_loop \
  --msg "M and A ${contract} all rules ${msg}" \
  --staging "jtoman/shitty-grounding" \
  --link ${contract}:eTokenImpl=EToken \
  $*
