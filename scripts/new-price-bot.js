const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const ropstenConfig = require('../euler-contracts/test/lib/token-setups/ropsten');
const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const provider = ethers.provider;
const et = require("../euler-contracts/test/lib/eTestLib");
const util = require('util');
const liveConfig = require('../addresses/token-addresses-main.json');
const defaultUniswapFee = 3000;
const routerABI = require('../abis/v3SwapRouterABI.json');
const erc20ABI = require('../abis/erc20ABI.json');
const positionManagerABI = require('../abis/NonfungiblePositionManager.json');
const factoryABI = require('../abis/UniswapV3Factory.json');
const poolABI = require('../abis/UniswapV3Pool.json');
const staticRouterABI = require('../artifacts/contracts/UniswapV3SwapRouterPeriphery.sol/UniswapV3SwapRouterPeriphery.json');


// tokens
let tokenPrices = [
    /*{
        token: "WBTC",
        price: 0
    },
    {
        token: "COMP",
        price: 0
    },
    {
        token: "UNI",
        price: 0
    },
    {
        token: "REP",
        price: 0
    },
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
    }
    {
        token: "USDC",
        price: 0
    },
    {   
        token: "DAI",
        price: 0
    },
    {
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


async function poolInfo(token0Address, token1Address) {
    const ctx = await et.getTaskCtx();
    let factory = new ethers.Contract(factoryAddress, factoryABI.abi, ctx.wallet);
    let poolAddress = await factory.getPool(token0Address, token1Address, defaultUniswapFee);
    return poolAddress;
}

async function balance(userAddress, tokenAddress) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(tokenAddress, abi, ctx.wallet);
    let balance = await erc20Token.balanceOf(userAddress);
    return(parseInt(balance) / (10**18));
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
        /* for (let listedToken of tokenPrices) {
            if(listedToken.token == token.symbol) {
                listedToken.price = trade.nextMidPrice.toSignificant(6)
            }
        } */
        return trade.nextMidPrice.toSignificant(6);
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

async function mintERC20(tokenSymbol) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../euler-contracts/artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(
        ropstenConfig.existingTokens[tokenSymbol].address, 
        abi, 
        ctx.wallet
    );
    let tx = await erc20Token.mint(ctx.wallet.address, et.eth('1000000'));
    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
    let result = await tx.wait();
    console.log(`Mined. Status: ${result.status}`);
}
//mintERC20('WBTC');

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

async function createAndInitPool(tokenSymbol) {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const token0 = ropstenConfig.existingTokens[tokenSymbol].address;
    const token1 = ropstenConfig.riskManagerSettings.referenceAsset;
    let sqrtPriceX96;
    //e.g., (1,1500) 1500 token = 1 eth, (1e14,1e6) 1 token = 0.0001 eth where token precisions matter
    //and 1e14 wei = 0.0001 eth
    //swap router direction <=
    if (ethers.BigNumber.from(token1).lt(token0)) {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1);
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500);
    }
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
//createAndInitPool('USDC')

async function addLiquidity(tokenSymbol, erc20AmountDesired, wethAmountDesired) {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const token0 = ropstenConfig.existingTokens[tokenSymbol].address;
    const token1 = ropstenConfig.riskManagerSettings.referenceAsset;
    //tick spacing
    //should be always safe: -886800 886800
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
    //can also send the eth here as msg.value instead of weth
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
//ensure to mint or check token balance and approval before adding liquidity
//addLiquidity('USDT', et.eth('100'), et.eth('0.1'));

async function swap(params) {
    const ctx = await et.getTaskCtx();
    // const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    const gasConfig = {gasPrice: 2e11, gasLimit: 7e6};

    try {
        let tx = await router.exactInputSingle(params, gasConfig); 
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
        let result = await tx.wait();
        console.log(`Mined. Status: ${result.status}`);
    } catch (e) {
        console.error(e.message);
    }
}

async function main() {
    const ctx = await et.getTaskCtx();
    // const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    // const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    // const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    
    /* let erc20Token = await token('USDC');
    let tokenPerWETH = await getExecutionPriceERC20(erc20Token, et.eth(1));
    
    console.log(tokenPerWETH) */

    let makeSwap = async () => {
        let swapParams = {
            tokenIn: '', 
            tokenOut: '',
            fee: defaultUniswapFee,
            recipient: ctx.wallet.address,
            deadline: '100000000000',
            amountIn: '',
            amountOutMinimum: 0,
            sqrtPriceLimitX96: '', 
        };     

        for (let listedToken of tokenPrices) {
            // let currentTokenPerWETH = listedToken.price;
            let erc20Token = await token(listedToken.token);
            let tokenPerWETH = await getExecutionPriceERC20(erc20Token, et.eth(1));
            
            let token0 = ropstenConfig.existingTokens[listedToken.token].address;
            let token1 = ropstenConfig.riskManagerSettings.referenceAsset;
            let poolAddress = await poolInfo(token0, token1);
            
            console.log(listedToken.token, "POOL ADDRESS: ", poolAddress);
            
            let token0Balance = await balance(poolAddress, token0);
            let token1Balance = await balance(poolAddress, token1);
            let currentPrice = token0Balance/token1Balance

            //slot0 price
            //let curr = await ctx.contracts.exec.callStatic.getPriceFull(token0);
            //let currentPrice = parseInt(curr.currPrice.div(1e9).toString()) / 1e9;

            console.log(token0Balance, token1Balance)
            console.log(currentPrice, tokenPerWETH)

            if (currentPrice < tokenPerWETH) {
                console.log('equation 8, swap erc20 for eth')
                const sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000);
                const valueIn = Math.sqrt(token0Balance * token1Balance * tokenPerWETH) - token0Balance; 
                swapParams.tokenIn = token0;
                swapParams.tokenOut = token1;
                swapParams.amountIn = et.eth((valueIn.toFixed(16)).toString());
                swapParams.sqrtPriceLimitX96 = sqrtPriceX96;
                console.log("value in ", swapParams.amountIn, valueIn)
                //await swap(swapParams);
            } else {
                console.log('equation 10, swap eth for erc20')
                const sqrtPriceX96 = et.ratioToSqrtPriceX96(100000000000, 0.00000000001);
                let valueIn = Math.sqrt((token0Balance * token1Balance)/tokenPerWETH) - token1Balance;
                swapParams.tokenIn = token1;
                swapParams.tokenOut = token0;
                swapParams.amountIn = et.eth((valueIn.toFixed(16)).toString());
                swapParams.sqrtPriceLimitX96 = sqrtPriceX96;
                console.log("value in ", swapParams.amountIn, valueIn)
                //await swap(swapParams);
            }
        }
    }

    makeSwap()
    //setInterval(makeSwap, 3600000); // Run bot every hour

}

//main();


async function main2() {
    // price if erc20 per weth - how much erc20 can we get for 1 weth
    const ctx = await et.getTaskCtx();
    const staticSwapRouterPeriphery = '0x8a318158fd05E9C797c0F9C9a1C22369154bb6dF';

    let routerPeriphery = new ethers.Contract(staticSwapRouterPeriphery, staticRouterABI.abi, ctx.wallet);
    // NOTE: to test new bot, static swap router contract needs to have the tokens / enough balance of the tokens
    const testToken = "0x86f1Dfe8F37358888D7F7D40Fa7D398b0199b6cc";
    const ropstenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab"; //weth
    
    let curr = await routerPeriphery.getPoolCurrentPrice(factoryAddress, ropstenWETH, testToken, 3000)
    let currPrice = parseInt(curr.div(1e9).toString()) / 1e9;
    console.log('current pool price', currPrice)

    let erc20Token = await token('CRV')
    let mainNetPrice = parseFloat(await getExecutionPriceERC20(erc20Token, et.eth(1)))
    console.log('main net price', mainNetPrice)

    let factory = new ethers.Contract(factoryAddress, factoryABI.abi, ctx.wallet);
    let pool = await factory.getPool(testToken, ropstenWETH, defaultUniswapFee);
    console.log("pool address", pool)
    
    let testTokenBalance = await tokenBalance(pool, testToken)
    console.log('test token pool balance ', testTokenBalance)
    
    let wethBalance = await tokenBalance(pool, ropstenWETH)
    console.log('WETH pool balance ', wethBalance)
    
    let tokenIn;
    let tokenOut;
    let amountIn;
    let sqrtPriceX96;

    // reducing multiplier, increases percentage difference and reduces price after swap
    let multiplier = 0.0625 
    let frac = 1.0625   
    /* multiplier = 0.0625 * 1.0625
    multiplier = 0.0625 * 1.1875
    multiplier = 0.0625 * 1.125
    multiplier = 0.0625 * 1.1875 */
    for(let i = 0; i < 50; i++) {
        if (i == 0) {
            multiplier = multiplier
        } else {
            multiplier = multiplier - (multiplier * 0.0125) 
        }
    
        if (currPrice == mainNetPrice || percentageDifference(currPrice, mainNetPrice) <= 0.2) {
            console.log("price is relative, no swap required")
            break;
        } else if (currPrice > mainNetPrice) {
            // if price goes up, swap weth for erc20
            amountIn = wethBalance * multiplier
            
            console.log('test token pool balance ', testTokenBalance)
            console.log("main net price is higher, starting search with fraction of of one quarter weth liquidity", amountIn)
            tokenIn = ropstenWETH
            tokenOut = testToken
            sqrtPriceX96 = et.ratioToSqrtPriceX96(100000000000, 0.00000000001)

            if(amountIn >= await tokenBalance(pool, tokenIn)){
                break;
            }

            let newPrice = await routerPeriphery.callStatic.exactInputSingle(
                factoryAddress,
                swapRouterAddress,
                tokenIn,
                tokenOut,
                '3000',
                ctx.wallet.address,
                '100000000000',
                et.eth(amountIn.toString()),
                0, 
                sqrtPriceX96 
                //{gasPrice: gp, gasLimit: gl}
            );
            console.log('amount out: ', ethers.utils.formatEther(newPrice.amountOut))
            let priceAfterSwap = parseInt(newPrice.sqrtPrice.div(1e9).toString()) / 1e9
            console.log('new price after swap', priceAfterSwap, 'main net price', mainNetPrice) 
        
            console.log('percentage difference ', percentageDifference(priceAfterSwap, mainNetPrice), percentageDifference(priceAfterSwap, mainNetPrice) <= 0.2)
            if(priceAfterSwap == mainNetPrice || percentageDifference(priceAfterSwap, mainNetPrice) <= 0.2){
                break;
            }  
            
        } else {
            // if price goes down, swap erc20 for weth
            amountIn = testTokenBalance * multiplier
            console.log("main net price is lower, starting search with fraction of one quarter token liquidity", amountIn)
            tokenIn = testToken 
            tokenOut = ropstenWETH
            sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000)

            if(amountIn >= await tokenBalance(pool, tokenIn)){
                break;
            }
            let newPrice = await routerPeriphery.callStatic.exactInputSingle(
                factoryAddress,
                swapRouterAddress,
                tokenIn,
                tokenOut,
                '3000',
                ctx.wallet.address,
                '100000000000',
                et.eth(amountIn.toString()),
                0, 
                sqrtPriceX96 
                //{gasPrice: gp, gasLimit: gl}
            );
            console.log('amount out: ', ethers.utils.formatEther(newPrice.amountOut))
            let priceAfterSwap = parseInt(newPrice.sqrtPrice.div(1e9).toString()) / 1e9
            console.log('new price after swap', priceAfterSwap, 'main net price', mainNetPrice) 
        
            console.log('percentage difference ', percentageDifference(priceAfterSwap, mainNetPrice), percentageDifference(priceAfterSwap, mainNetPrice) <= 0.2)
            if(priceAfterSwap == mainNetPrice || percentageDifference(priceAfterSwap, mainNetPrice) <= 0.2){
                break;
            } 
        }
    }
}
main2()




async function tokenBalance(userAddress, tokenAddress) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(tokenAddress, abi, ctx.wallet);
    let balance = await erc20Token.balanceOf(userAddress);
    return(parseInt(balance) / (10**18));
}

function percentageDifference(a, b)
{
    let difference = Math.abs(a-b)
    let average = (a+b)/2
    return (100 * (difference/average) )
}