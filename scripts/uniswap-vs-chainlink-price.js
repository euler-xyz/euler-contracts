const eTestLib = require('../test/lib/eTestLib');
const oracleArtifact = require('../artifacts/contracts/oracles/UniswapV3TWAPOracle.sol/UniswapV3TWAPOracle.json');
const marketsArtifact = require('../artifacts/contracts/modules/Markets.sol/Markets.json');
const addresses = require('../addresses/euler-addresses-mainnet.json')

const leftBitShift = (a, b) => eTestLib.BN(a).mul(eTestLib.BN(2).pow(b))

async function main() {
    const ctx = await eTestLib.getTaskCtx('mainnet');
    const quoteAsset = ctx.tokenSetup.existingTokens.WETH.address;
    const uniswapV3TWAPOracle = new eTestLib.ethers.Contract(
        ctx.tokenSetup.existingContracts.uniswapV3TWAPOracle,
        oracleArtifact.abi,
        eTestLib.ethers.provider
    )
    const markets = new eTestLib.ethers.Contract(
        addresses.markets,
        marketsArtifact.abi,
        eTestLib.ethers.provider
    )

    let tokens = [];
    for(const symbol of Object.keys(ctx.tokenSetup.existingTokens)) {
        const underlying = ctx.tokenSetup.existingTokens[symbol].address
        const assetConfig = await ctx.contracts.markets.underlyingToAssetConfig(underlying)
        const pricingConfig = await ctx.contracts.markets.getPricingConfig(underlying)
        const chainlinkAggregator = await markets.getChainlinkPriceFeedConfig(underlying)
        const chainlinkKey = Object.keys(ctx.tokenSetup.existingContracts)
            .find(key => key.startsWith(`chainlinkAggregator_${symbol}_`))

        if (chainlinkKey && pricingConfig.pricingParameters !== 0) {
            if (chainlinkAggregator.toLowerCase() !== ctx.tokenSetup.existingContracts[chainlinkKey].toLowerCase()) {
                console.log(`${symbol}: Chainlink address mismatch`)
                console.log(`   Contract setup: ${chainlinkAggregator}`)
                console.log(`   Test lib setup: ${ctx.tokenSetup.existingContracts[chainlinkKey]}\n`)
                continue
            }

            tokens.push({
                symbol: symbol,
                underlying: underlying,
                chainlinkAggregator: chainlinkAggregator,
                twapWindow: assetConfig.twapWindow,
                fee: pricingConfig.pricingParameters
            })
        }
    }

    for(const token of tokens) {
        const chainlinkAggregator = new eTestLib.ethers.Contract(
            token.chainlinkAggregator,
            ['function latestAnswer() external view returns (int256)'],
            eTestLib.ethers.provider
        )

        token.bestFee = (await uniswapV3TWAPOracle.findBestUniswapPool(
            ctx.tokenSetup.riskManagerSettings.uniswapFactory,
            token.underlying,
            quoteAsset
        )).fee;

        token.uniswapTWAP = parseFloat(
            eTestLib.ethers.utils.formatEther(
                (await uniswapV3TWAPOracle.getPrice({
                    underlyingAsset: token.underlying, 
                    quoteAsset: quoteAsset, 
                    constraints: leftBitShift(token.twapWindow, 64),
                    parameters: token.fee
                })).price
            )
        );

        //token.uniswapTWAP = parseFloat(
        //    eTestLib.ethers.utils.formatEther(
        //        (await ctx.contracts.exec.getPrice(token.underlying)).twap
        //    )
        //);

        token.chainlinkPrice = parseFloat(
            eTestLib.ethers.utils.formatEther(
                await chainlinkAggregator.latestAnswer().catch(_ => eTestLib.BN(0))
            )
        );
    }

    console.log('Uniswap vs Chainlink results:');
    for(const token of tokens) {
        const absDiff = Math.abs(token.uniswapTWAP - token.chainlinkPrice);
        const relDiff = absDiff / token.uniswapTWAP

        console.log(`${token.symbol}:`);
        console.log(`   UNISWAP TWAP (${token.twapWindow}): ${token.uniswapTWAP} ${token.fee !== token.bestFee ? `<--- SUBOPTIMAL UNISWAP POOL USED (${token.fee} vs ${token.bestFee})` : ""}`);
        console.log(`   ${`CHAINLINK:`.padEnd(20, ' ')} ${token.chainlinkPrice}`);
        console.log(`   ${`diff:`.padEnd(20, ' ')} ${absDiff} (${(relDiff * 100).toFixed(2)}%) ${relDiff > 0.01 ? "<--- SERIOUS DISCREPANCY" : ""}`);
    }
}

main();
