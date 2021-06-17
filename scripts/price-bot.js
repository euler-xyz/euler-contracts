
const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const ropstenConfig = require('../test/lib/token-setups/ropsten');
const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const provider = ethers.provider;
const et = require("../test/lib/eTestLib");
const ropstenChainId = 3; // ropsten chain id
const util = require('util');
const liveConfig = require('../addresses/token-addresses-main.json');
const defaultUniswapFee = 3000;
const routerABI = require('../abis/v3SwapRouterABI.json');
const experimentalABI = require('../abis/experimentalABI.json');
const erc20ABI = require('../abis/erc20ABI.json');
const positionManagerABI = require('../abis/NonfungiblePositionManager.json');

// tokens
let tokenPrices = [
    /* {
        token: "WBTC",
        price: 0
    }, */
    {
        token: "COMP",
        price: 0
    },
    {
        token: "UNI",
        price: 0
    },
    /* {
        token: "REP",
        price: 0
    }, */
    {
        token: "BZRX",
        price: 0
    },
    {
        token: "DOUGH",
        price: 0
    },
    {
        token: "CRV",
        price: 0
    },
    {
        token: "USDC",
        price: 0
    },
    {   
        token: "DAI",
        price: 0
    },
    /* {
        token: "USDT",
        price: 0
    } */
]


// Uniswap V3 contracts
const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984'; 
const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const positionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

// main net tokens
async function token(symbol) {
    return new Token(
        ChainId.MAINNET, 
        liveConfig[symbol].address,
        liveConfig[symbol].decimals,
        symbol,
        liveConfig[symbol].name,
    )
}

// main net prices

// price of token amount in WETH
async function getExecutionPriceWETH(token, amount) {
    try {
        // amount should be in token decimals
        const pair = await Fetcher.fetchPairData(WETH[token.chainId], token)
        // Passing WETH as the input token, i.e., a WETH -> <token> trade.
        // Route is in this <= direction for token0
        const route = new Route([pair], token)
        const trade = new Trade(route, new TokenAmount(token, amount), TradeType.EXACT_INPUT)
        for (let listedToken of tokenPrices) {
            if(listedToken.token == token.symbol) {
                listedToken.price = trade.nextMidPrice.toSignificant(6)
            }
        }
    } catch {
        console.error(e.message);
    }
}

// price of WETH amount in erc20 token
async function getExecutionPriceERC20(token, amount) {
    try {
        const pair = await Fetcher.fetchPairData(token, WETH[token.chainId])
        const route = new Route([pair], WETH[token.chainId])
        const trade = new Trade(route, new TokenAmount(WETH[token.chainId], amount), TradeType.EXACT_INPUT)
        return trade.nextMidPrice.toSignificant(6);
    } catch (e) {
        console.error(e.message);
    }
}

async function approval() {
    const ctx = await et.getTaskCtx();
    for (let listedToken of tokenPrices) {
        let erc20TokenInstance = new ethers.Contract(ropstenConfig.existingTokens[listedToken.token].address, erc20ABI, ctx.wallet);
        let wethTokenInstance = new ethers.Contract(ropstenConfig.riskManagerSettings.referenceAsset, erc20ABI, ctx.wallet);
        let clients = [positionManagerAddress, swapRouterAddress];
        for (let i of clients) {
            try {
                let tx = await erc20TokenInstance.approve(i, et.MaxUint256);
                console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
                let result = await tx.wait();
                console.log(`Mined. Status: ${result.status}`);
                /* tx = await wethTokenInstance.approve(i, et.MaxUint256);
                console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
                result = await tx.wait();
                console.log(`Mined. Status: ${result.status}`); */
            } catch (e) {
                console.error(e.message);
            }
        }
    }
}
//approval();

async function createAndInitPool(address0) {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const token0 = address0;
    const token1 = ropstenConfig.riskManagerSettings.referenceAsset;
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500);
    const createAndInitializeData = nft.interface.encodeFunctionData('createAndInitializePoolIfNecessary', [
        token0,
        token1,
        3000,
        sqrtPriceX96
      ])

      //can also send the eth here as value instead of weth
      let tx = await nft.multicall([createAndInitializeData])
      console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
      let result = await tx.wait();
      console.log(`Mined. Status: ${result.status}`);
}
//createAndInitPool(ropstenConfig.existingTokens['WBTC'].address;)

async function addLiquidity(tokenSymbol, erc20AmountDesired, wethAmountDesired) {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const token0 = ropstenConfig.existingTokens[tokenSymbol].address;
    const token1 = ropstenConfig.riskManagerSettings.referenceAsset;
    //used tokenPerETH price based on initializing pool
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, tokenPerETH);
    const expiryDate = Math.floor(Date.now() / 1000) + 10000;
    const mintData = nft.interface.encodeFunctionData('mint', [
        {
            token0: token0,
            token1: token1,
            tickLower: -886800, 
            tickUpper: 886800,
            fee: 3000,
            recipient: ctx.wallet.address,
            amount0Desired: erc20AmountDesired,
            amount1Desired: wethAmountDesired,
            amount0Min: '0',
            amount1Min: '0',
            deadline: expiryDate,
        },
    ])
    //can also send the eth here as value instead of weth
    try {    
        let tx = await nft.multicall([mintData], {gasPrice: 2e11, gasLimit: 8e6});
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
        let result = await tx.wait();
        console.log(`Mined. Status: ${result.status}`);
    } catch (e) {
        console.error(e.message);
    }

}
//mint function will auto configure amount to add to liquidity based
//on entered price if amount is higher than expected.
//ensure to mint or check balance and approval before adding liquidity
//with correct ratio - https://ropsten.etherscan.io/tx/0x9396b81cf70f95927f7346f7abf8af4c178c5737770e3385610c83fbf8ba04c5
//with wrong ratio - https://ropsten.etherscan.io/tx/0x86406d3494a0b4ed925bfca0d8dd8b1c0ebad0a53d50b2890f4ae8d21675a91b
//initial liquidity based on 1:1500
addLiquidity('USDC', et.eth(100), et.eth(0.06)); //working at 1:1500


async function main() {
    const ctx = await et.getTaskCtx();
    // const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    
    let makeSwap = async () => {
        const gasConfig = {gasPrice: 2e11, gasLimit: 8e6};

        for (let listedToken of tokenPrices) {
            let currentTokenPerWETH = listedToken.price;
            let erc20Token = await token(listedToken.token);
            let tokenPerWETH = await getExecutionPriceERC20(erc20Token, et.eth(1));
            
            // if ETH/USD is $2500, 
            // then create a position across a large range, 
            // such as [0.000000001, 1000000000], using small amounts, e.g., : 
            // 2.5 USDT and 0.001 WETH
            if (currentTokenPerWETH > tokenPerWETH) {
                // If price goes down, sell test ETH for mock ERC20 token.
                // swap 1 for 0
                let tokenIn = ropstenConfig.riskManagerSettings.referenceAsset;
                let tokenOut = ropstenConfig.existingTokens[listedToken.token].address;
                console.log(currentTokenPerWETH, tokenPerWETH, tokenIn, tokenOut);
                let valueOut = et.eth((tokenPerWETH/1e6).toFixed(15)); //Math.floor((tokenPerWETH/1e6) * (10 ** erc20Token.decimals)).toString();
                let valueIn = et.eth(1/1e6);
                let sqrtPriceX96 = et.ratioToSqrtPriceX96(1000000000, 0.000000001);
                const params = {
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: defaultUniswapFee,
                    recipient: ctx.wallet.address,
                    deadline: '100000000000',
                    amountIn: valueIn,
                    amountOutMinimum: valueOut,
                    sqrtPriceLimitX96: sqrtPriceX96,
                };
                console.log(`swapping token1 WETH value in ${valueIn / (10**18)} for token0 ${listedToken.token} ${valueOut / (10**18)}`)
                try {
                    let tx = await router.exactInputSingle(params, gasConfig); 
                    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
                    let result = await tx.wait();
                    console.log(`Mined. Status: ${result.status}`);
                } catch (e) {
                    console.error(e.message);
                }
                console.log(`price of ETH to ${listedToken.token} decreased, sold WETH for ${listedToken.token}`)
                listedToken.price = tokenPerWETH;
            } else if (currentTokenPerWETH == 0  || currentTokenPerWETH < tokenPerWETH) {
                // If price goes up on mainnet, mint some mock ERC20 token and buy test ETH. 
                // swap 0 for 1
                let tokenIn = ropstenConfig.existingTokens[listedToken.token].address;
                let tokenOut = ropstenConfig.riskManagerSettings.referenceAsset;
                console.log(currentTokenPerWETH, tokenPerWETH, tokenIn, tokenOut);
                let valueIn = et.eth((tokenPerWETH/1e6).toFixed(15)); //Math.floor((tokenPerWETH/1e6) * (10 ** erc20Token.decimals)).toString();
                let valueOut = et.eth(1/1e6);
                let sqrtPriceX96 = et.ratioToSqrtPriceX96(0.000000001, 1000000000);
                const params = {
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: defaultUniswapFee,
                    recipient: ctx.wallet.address,
                    deadline: '100000000000',
                    amountIn: valueIn,
                    amountOutMinimum: valueOut,
                    sqrtPriceLimitX96: sqrtPriceX96,
                };
                console.log(`swapping token0 ${listedToken.token} value in ${valueIn / (10**18)} for token1 WETH ${valueOut / (10**18)}`)
                try {
                    let tx = await router.exactInputSingle(params, gasConfig); 
                    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
                    let result = await tx.wait();
                    console.log(`Mined. Status: ${result.status}`);
                } catch (e) {
                    console.error(e.message);
                }
                console.log(`price of ETH to ${listedToken.token} increased, sold ${listedToken.token} for WETH`)
                listedToken.price = tokenPerWETH;
            }
        }
    }

    setInterval(makeSwap, 3600000); // 60 minutes // Run bot every hour
    // added liquidity should be enough for 12 weeks at 2016 hours in total
    // and 168 hours per week
    // 2016 * 0.0024334 = 4.9057344
    // 2016 * 0.000001 = 0.002016
}
//main();

//swap with correct ratio - https://ropsten.etherscan.io/tx/0x4522128ed54c03e61c8339137c919e5fba02ee091f0d1be0e2ecdf37cf320b6d
//fails with incorrect ratio

//swaps with bot - 2 cycles of 1 minute for USDT token
//https://ropsten.etherscan.io/tx/0xa3050b2e5adfb3ef3f9eebadd3dd2ef8dbf5fd821ed9f5f114c227ec11b2ebb3
//https://ropsten.etherscan.io/tx/0xd88d2b4ef66f76f5199188119ebc635b3123107ac82a4f7578531a1b9fe31be2

//npx hardhat --network ropsten euler --callstatic exec.getPriceFull token:USDT

//bot test with DAI
/* 0 2433.4 0x6030F89efa5712022Db83Ce574c202CdDdC94a78 0xc778417E063141139Fce010982780140Aa0cD5Ab
swapping token0 DAI value in 0.0024334 for token1 WETH 0.000001
Transaction: 0x4ee86ea10ab8d967128c74f595c7e33aa20ae7349569e0f275f74d384d08b838 (on ropsten)
Mined. Status: 1
price of ETH to DAI increased, sold DAI for WETH 

https://ropsten.etherscan.io/tx/0x4ee86ea10ab8d967128c74f595c7e33aa20ae7349569e0f275f74d384d08b838

*/