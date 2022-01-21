message=$1
sh certora/scripts/verifyMarketsAssets.sh EToken  "$message"
sh certora/scripts/verifyMarketsAssets.sh Markets "$message"
sh certora/scripts/verifyMarketsAssets.sh DToken  "$message"
