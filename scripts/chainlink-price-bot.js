const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
// const provider = ethers.provider;
// const util = require('util');
// const et = require("../euler-contracts/test/lib/eTestLib");

// abis 
// const mockChainLinkPriceOracleABI = require("../abis/MockAggregatorProxy.json").abi;
// const ERC20ABI = require("../abis/erc20ABI.json");

// tokens
const tokenSymbols = ['WBTC', 'UNI', 'USDC', 'USDT', 'CRV', 'COMP', 'DOGE'];
const mainnet = {
    WBTC: new Token(
        ChainId.MAINNET,
        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',//address,
        8,//decimals,
        'WBTC',//symbol,
        'Wrapped BTC'//name,
    ),
    WETH: new Token(
        ChainId.MAINNET,
        '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',//address,
        18,//decimals,
        'WETH',//symbol,
        'Wrapped Ether'//name,
    ),
    UNI: new Token(
        ChainId.MAINNET,
        '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',//address,
        18,//decimals,
        'UNI',//symbol,
        'Uniswap'//name,
    ),
    USDC: new Token(
        ChainId.MAINNET,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',//address,
        6,//decimals,
        'USDC',//symbol,
        'USD Coin'//name,
    ),
    USDT: new Token(
        ChainId.MAINNET,
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',//address,
        6,//decimals,
        'USDT',//symbol,
        'Tether USD'//name,
    ),
    DOGE: new Token(
        ChainId.MAINNET,
        '0x4206931337dc273a630d328dA6441786BfaD668f',//address,
        18,//decimals,
        'DOGE',//symbol,
        'Dogecoin'//name,
    ),
    COMP: new Token(
        ChainId.MAINNET,
        '0xc00e94Cb662C3520282E6f5717214004A7f26888',//address,
        18,//decimals,
        'COMP',//symbol,
        'Compound'//name,
    ),
    CRV: new Token(
        ChainId.MAINNET,
        '0xD533a949740bb3306d119CC777fa900bA034cd52',//address,
        18,//decimals,
        'CRV',//symbol,
        'Curve DAO Token'//name,
    )
}

const goerli = {
    tokens: {
        WETH: "0xa3401DFdBd584E918f59fD1C3a558467E373DacC",
        UNI: "0x2980D241BEA2A49d3333AA931884d68C704E7Db7",
        USDC: "0x693FaeC006aeBCAE7849141a2ea60c6dd8097E25",
        USDT: "0x7594a0368F18e666480Ad897612f28ad17435B4C",
        DOGE: "0x67cF0FF98bE17bF02F7c6346028C9e8BB3c203B2",
        WBTC: "0xc49BB678a4d822f7F141D5bb4585d44cCe51e25E",
        COMP: "0x6520f3394a2000eA76e7cA96449B78BB0eD07561",
        CRV: "0x9eA3D1d18A0e7Ec379C577f615220e6D715F3b29"
    },
    chainlinkOracles: {
        UNI: "0x8039102cE7E5fa49798f11530368301Ffa5Ae650",
        USDC: "0x362a26a19466b3B9962e223A0733E21dfF79166E",
        USDT: "0x55C34D69166c9Cb91BBa5Ad02f4fE54F01c29a4c",
        DOGE: "0xDd501690aC234A373f35e3Eff7A38116386be789",
        WBTC: "0x9b4FA47152593D99a34E451E00CAccabAa7850A7",
        COMP: "0x2e45E4B2d6CBBAd2E3D576dFa04662778d745cA0",
        CRV: "0x87351b560ebc1810CF33cBA7A0b508e2Cf36e821"
    },
}

async function chainlinkPriceBot() {
    try {
        // https://docs.uniswap.org/sdk/2.0.0/guides/pricing
        for (let i of tokenSymbols) {
            /* get price of asset in WETH from mainnet */
            console.log(`Parsing ${mainnet[i].symbol}`)

            const pair = await Fetcher.fetchPairData(mainnet[i], WETH[mainnet[i].chainId])
            const route = new Route([pair], mainnet[i])
            
            console.log('mid price', route.midPrice.toSignificant(6))
            console.log('mid price inverted', route.midPrice.invert().toSignificant(6))
            
            const priceInEth = ethers.utils.parseEther(route.midPrice.toSignificant(6).toString())
            console.log('mid price in underlying (WETH)', priceInEth)
            console.log('mid price in underlying (WETH)', priceInEth.toString())
        
            /* set price of asset in goerli mock chainlink price oracle */
            const oracle = await ethers.getContractAt('MockAggregatorProxy', goerli.chainlinkOracles[i]);
            // check current valid answer is not the same before 
            // updating it on goerli with new price
            const latestAnswer = await oracle.latestAnswer();
            console.log('current price on goerli', latestAnswer.toString())
            
            if (latestAnswer.toString() !== priceInEth.toString()) {
                const tx = await oracle.mockSetValidAnswer(priceInEth);
                console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);

                const result = await tx.wait();
                console.log(`Status: ${result.status}`);
            } else {
                console.log(`Price for ${mainnet[i].symbol} is same as mainnet`)
            }
            
        }
    } catch (e) {
        console.error(e.message);
    }
}

async function sleep(milliseconds) {
    const date = Date.now();
    let currentDate = null;
    do {
        currentDate = Date.now();
    } while (currentDate - date < milliseconds);
};

async function main() {
    setInterval(chainlinkPriceBot, 1800000) // 30 minutes in milliseconds

    // chainlinkPriceBot();
}

main()
