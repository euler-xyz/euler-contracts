if [ -z $1 ]
then
    echo "Usage:"
    echo "   certora/scripts/$(basename $0) MODULE"
    echo ""
    echo "where MODULE is one of:"
    ls -p certora/munged/modules | grep -v / | xargs basename -s .sol
    exit 1
fi

contract=$1
shift 1

make -C certora munged

certoraRun \
    certora/munged/modules/${contract}.sol \
    certora/helpers/DummyERC20A.sol   \
    certora/munged/modules/EToken.sol   \
    --verify ${contract}:certora/spec/common.spec \
    --rule sanity                       \
    --solc solc8.0                      \
    --solc_args '["--optimize"]' \
    --settings -t=60,-postProcessCounterExamples=true,-enableStorageAnalysis=true   \
    --msg "sanity ${contract} $1"                   \
    --link ${contract}:eTokenImpl=EToken \
    --staging


