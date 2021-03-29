const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

const eTestLib = require("../test/lib/eTestLib");


let defaultMinInterval = 30 * 60;
let defaultTradePeriod = 30; // uniswap trade will happen every N seconds, on average
let defaultPriceQueuePeriod = 60; // opentwap price queueing will happen every N seconds, on average

let tokens = [
    {
        sym: 'DAI',
        mid: 0.000562089,
        deviation: 0.01,
    },
    {
        sym: 'USDC',
        mid: 0.000555855,
        deviation: 0.001,
    },
    {
        sym: 'BAT',
        mid: 0.000472044,
    },
    {
        sym: 'LINK',
        mid: 0.016419,
    },
    {
        sym: 'UNI',
        mid: 0.0172596,
    },
    {
        sym: 'YFI',
        mid: 20.3573,
    },
    {
        sym: 'COMP',
        mid: 0.252798,
    },
];




async function main() {
    const ctx = await eTestLib.getScriptCtx('staging');

    let updatePrices = async () => {
        for (let token of tokens) {
            if (Math.random() < 1 / (token.tradePeriod || defaultTradePeriod)) {
                let newPrice = randPrice(token.mid || 0.001, token.deviation || .1);
                console.log(`Uniswap trade: ${token.sym}/WETH => ${newPrice}`)
                await ctx.updateUniswapPrice(`${token.sym}/WETH`, newPrice);
            }

            if (Math.random() < 1 / (token.priceQueuePeriod || defaultPriceQueuePeriod)) {
                let minInterval = token.minInterval || defaultMinInterval;
                console.log(`Queueing price: ${token.sym}/WETH minInterval=${minInterval}`)
                await ctx.queuePriceUpdate(`${token.sym}/WETH`, minInterval);
            }
        }
    };

    let updateTime = async () => {
        await ctx.mineEmptyBlock();

        let currBlockTime = (await ctx.provider.getBlock()).timestamp;
        let now = getCurrTime();

        let behind = now - currBlockTime;
        if (behind <= 0) return;

        console.log(`Time: Jumping ${behind}s  [${now} / ${currBlockTime}]`);
        await ctx.increaseTime(behind);
    };


    setInterval(updatePrices, 1000);
    setInterval(updateTime, 13000);
}

main();



///////////////

function randPrice(mid, deviation) {
    let scale = 1 + (Math.random() * deviation * 2) - deviation;
    let price = mid * scale;
    price = '' + price;
    let [pre, post] = price.split('.');
    return pre + '.' + post.substr(0,18);
}

function getCurrTime() {
    return Math.floor((new Date()).getTime() / 1000);
}
