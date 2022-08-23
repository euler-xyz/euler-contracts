const eTestLib = require('../test/lib/eTestLib');
const { abi } = require('../artifacts/contracts/oracles/UniswapV3TWAPOracle.sol/UniswapV3TWAPOracle.json');

const PRICINGTYPE__UNISWAP3_TWAP = 2;
const PRICINGTYPE__CHAINLINK = 4;

const leftBitShift = (a, b) => eTestLib.BN(a).mul(eTestLib.BN(2).pow(b))

async function main() {
    const ctx = await eTestLib.getTaskCtx('mainnet');
    const quoteAsset = ctx.tokenSetup.existingTokens.WETH.address;
    const uniswapV3TWAPOracle = new eTestLib.ethers.Contract(
        ctx.tokenSetup.existingContracts.uniswapV3TWAPOracle,
        abi,
        eTestLib.ethers.provider
    )

    let tokens = [];
    for(const symbol of Object.keys(ctx.tokenSetup.existingTokens)) {
        const chainlinkKey = Object.keys(ctx.tokenSetup.existingContracts)
            .find(key => key.startsWith(`chainlinkAggregator_${symbol}_`))
        
        if (chainlinkKey) {
            const assetConfig = await ctx.contracts.markets.underlyingToAssetConfig(ctx.tokenSetup.existingTokens[symbol].address);
            const pricingConfig = await ctx.contracts.markets.getPricingConfig(ctx.tokenSetup.existingTokens[symbol].address);

            tokens.push({
                symbol: symbol,
                underlying: ctx.tokenSetup.existingTokens[symbol].address,
                chainlinkAggregator: ctx.tokenSetup.existingContracts[chainlinkKey],
                twapWindow: assetConfig.twapWindow,
                fee: pricingConfig.pricingType === PRICINGTYPE__UNISWAP3_TWAP || 
                     pricingConfig.pricingType === PRICINGTYPE__CHAINLINK 
                     ? pricingConfig.pricingParameters
                     : undefined
            })
        }
    }

    for(const token of tokens) {
        const chainlinkAggregator = new eTestLib.ethers.Contract(
            token.chainlinkAggregator,
            ['function latestAnswer() external view returns (int256)'],
            eTestLib.ethers.provider
        )

        //token.uniswapTWAP = parseFloat(
        //    eTestLib.ethers.utils.formatEther(
        //        (await ctx.contracts.exec.getPrice(token.underlying)).twap
        //    )
        //);

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

        token.chainlinkPrice = parseFloat(
            eTestLib.ethers.utils.formatEther(
                await chainlinkAggregator.latestAnswer()
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
