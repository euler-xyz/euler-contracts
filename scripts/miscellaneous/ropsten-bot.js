const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const ropstenConfig = require('../../euler-contracts/test/lib/token-setups/ropsten');
const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const provider = ethers.provider;
const et = require("../../euler-contracts/test/lib/eTestLib");

const util = require('util');
const liveConfig = require('../../addresses/token-addresses-main.json');
const defaultUniswapFee = 3000;
const routerABI = require('../../abis/v3SwapRouterABI.json');
const erc20ABI = require('../../abis/erc20ABI.json');
const positionManagerABI = require('../../abis/NonfungiblePositionManager.json');
const execABI = require('../../euler-contracts/artifacts/contracts/modules/Exec.sol/Exec.json');
const riskABI = require('../../euler-contracts/artifacts/contracts/modules/RiskManager.sol/RiskManager.json');
const factoryABI = require('../../abis/UniswapV3Factory.json');
const poolABI = require('../../abis/UniswapV3Pool.json');
const staticRouterABI = require('../../artifacts/contracts/UniswapV3SwapRouterPeriphery.sol/UniswapV3SwapRouterPeriphery.json');

const eulerAddresses = require('../../euler-contracts/addresses/euler-addresses-ropsten.json');

/// Ropsten Uniswap V3 contracts

const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const positionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';
const staticSwapRouterPeriphery = '0x8a318158fd05E9C797c0F9C9a1C22369154bb6dF';


// live net tokens
async function token(symbol) {
    return new Token(
        ChainId.MAINNET,
        liveConfig[symbol].address,
        liveConfig[symbol].decimals,
        symbol,
        liveConfig[symbol].name,
    )
}

/**
 * create test token
 * create pool with WETH with price of 1:100
 * add liquidity at this price
 * try to swap for 1:1000
 */
const ropstenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";
const testToken = "0xCAfC3274Ba43825fCDCcE3D3263132A399658C7D" // new usdt
//const testToken = "0x95689Faeed6691757Df1AD48B7beA1B8Acf2dABe" // new usdc
//const testToken = "0xB7fe2334CD47383C17bfb97B09823F11cc1A91B8" // dai
//const testToken = "0x27162084BD4B772Fd58B2c65ee0EDF98D9965227"; //tc6, 6 decimals
//const testToken = '0x318010fe8ee7c627e60dcfBF52A16fA79c22ad5F'; //old wbtc
const poolAddress = '0x771eE880D236f24efFC3505C9999E08FbbbB6641';
const exec = '0xA9F08f143C6766aC0A931c10223D53C5499B4f3C';
const riskM = '0x57079C1D27F52342C5d517b012ea46e46d262064';

const gp = 200000000000;
const gl = 6324360;
const gasConfig = { gasPrice: gp, gasLimit: gl };

async function deployRouterStatic() {
    const ctx = await et.getTaskCtx();
    const RouterPeriphery = await hre.ethers.getContractFactory("UniswapV3SwapRouterPeriphery");
    let routerPeriphery = await (await RouterPeriphery.deploy(ropstenWETH)).deployed();
    let routerPeripheryAddress = (await routerPeriphery.deployed()).address;
    console.log(`contract: ${routerPeripheryAddress}`)
}
//deployRouterStatic()


async function testStaticRouter() {
    const ctx = await et.getTaskCtx();
    let routerPeriphery = new ethers.Contract(staticSwapRouterPeriphery, staticRouterABI.abi, ctx.wallet);
    
    /* 
    //PRICE FUNCTION WORKING
    let curr = await routerPeriphery.getPoolCurrentPrice(factoryAddress, ropstenWETH, testToken, 3000)
    let currPrice = parseInt(curr.div(1e9).toString()) / 1e9;
    console.log('current pool price', currPrice) */

    //SWAP FUNCTION WORKING!!!
    //mint to it, then call swap
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000);

    let curr = await routerPeriphery.callStatic.exactInputSingle(
        factoryAddress,
        swapRouterAddress,
        testToken,
        ropstenWETH,
        '500',//'3000' fee
        ctx.wallet.address,
        '100000000000',
        10*(10**6),
        //et.eth('10'),
        0, 
        sqrtPriceX96 
        //{gasPrice: gp, gasLimit: gl}
    );
    console.log('amount out: ', ethers.utils.formatEther(curr.amountOut))
    //console.log('current price', parseInt(curr.sqrtPrice.div(1e9).toString()) / 1e9)
    console.log('current price', parseInt(curr.sqrtPrice.div(1e3).toString()) / 1e3)
}
//testStaticRouter()
// swap tx from periphery - https://ropsten.etherscan.io/tx/0x83370792cfbe3e00d6bfd6a8627fcb5cd90e3f9cc5bfa87229ffb3e879dd6e8f

function percentageDifference(a, b)
{
    let difference = Math.abs(a-b)
    let average = (a+b)/2
    return (100 * (difference/average) )
}
//console.log(percentageDifference(10339.6, 10359.765576074))


/* async function swapAmountSearch() {
    // price if erc20 per weth - how much erc20 can we get for 1 weth
    const ctx = await et.getTaskCtx();
    let routerPeriphery = new ethers.Contract(staticSwapRouterPeriphery, staticRouterABI.abi, ctx.wallet);
    
    let curr = await routerPeriphery.getPoolCurrentPrice(factoryAddress, ropstenWETH, testToken, 3000)
    let currPrice = parseInt(curr.div(1e9).toString()) / 1e9;
    console.log('current pool price', currPrice)

    let erc20Token = await token('USDC')
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
    // multiplier = 0.0625 * 1.0625
    // multiplier = 0.0625 * 1.1875
    // multiplier = 0.0625 * 1.125
    // multiplier = 0.0625 * 1.1875
    
    if (currPrice == mainNetPrice || percentageDifference(currPrice, mainNetPrice) < 0.5) {
        console.log("price is relative, no swap required")
    } else if (currPrice > mainNetPrice) {
        // if price goes up, swap weth for erc20
        amountIn = wethBalance * multiplier
        console.log("main net price is higher, starting search with fraction of of one quarter weth liquidity", amountIn)
        tokenIn = ropstenWETH
        tokenOut = testToken
        sqrtPriceX96 = et.ratioToSqrtPriceX96(100000000000, 0.00000000001)
    } else {
        // if price goes down, swap erc20 for weth
        amountIn = testTokenBalance * multiplier
        console.log("main net price is lower, starting search with fraction of one quarter token liquidity", amountIn)
        tokenIn = testToken 
        tokenOut = ropstenWETH
        sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000)
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
    console.log('new price after swap', priceAfterSwap) 

    console.log('percentage difference ', percentageDifference(priceAfterSwap, mainNetPrice))
} */
//swapAmountSearch()


async function poolInfo(poolFee, tokenDecimals) {
    const ctx = await et.getTaskCtx();
    let factory = new ethers.Contract(factoryAddress, factoryABI.abi, ctx.wallet);
    let pool = await factory.getPool(testToken, ropstenWETH, poolFee);
    console.log('pool address', pool)

    let poolInstance = new ethers.Contract(pool, poolABI.abi, ctx.wallet);
    console.log('pool slot0', ((await poolInstance.slot0()).sqrtPriceX96).toString())

    console.log('pool fee', (await poolInstance.fee()).toString())

    //let riskManager = new ethers.Contract(riskM, riskABI.abi, ctx.wallet);
    //console.log(await riskManager.getPriceFull(testToken)) 

    let routerPeriphery = new ethers.Contract(staticSwapRouterPeriphery, staticRouterABI.abi, ctx.wallet);
    // CHECK FEE 500, 3000, etc
    let curr = await routerPeriphery.getPoolCurrentPrice(factoryAddress, ropstenWETH, testToken, poolFee)
    //let currPrice = parseInt(curr.div(1e9).toString()) / 1e9;
    // equation below will give approx. ~ token0 pool balance / token1 pool balance
    let currPrice = (curr.div(1*(Math.pow(10,tokenDecimals/2))).div(1*(Math.pow(10,tokenDecimals/2)))).toString();
    console.log('current pool price', currPrice);

    //const execInstance = new ethers.Contract(exec, execABI.abi, ctx.wallet);
    //let curr = await ctx.contracts.exec.callStatic.getPriceFull(testToken);
    //let currPrice = parseInt(curr.currPrice.div(1e9).toString()) / 1e9;
    //console.log(currPrice);

    console.log('token0', await poolInstance.token0());
    console.log('token1', await poolInstance.token1());
    let tok0 = await poolInstance.token0();
    let tok1 = await poolInstance.token1();
    let token0Balance = await tokenBalance(poolInstance.address, tok0, 6);
    let token1Balance = await tokenBalance(poolInstance.address, tok1, 18);
    console.log('token0 pool balance', token0Balance)
    console.log('token1 pool balance', token1Balance)
    /* let currentPrice = token1Balance/token0Balance
    console.log(currentPrice) */
    
    // collect 
    /* const MaxUint128 = ethers.BigNumber.from(2).pow(128).sub(1)
    const recipient = ctx.wallet.address
    const tickLower = 0//-886800
    const tickUpper = 0
    let tx = await poolInstance.collect(
        recipient,
        tickLower,
        tickUpper,
        MaxUint128.toString(), // amount0Requested
        MaxUint128.toString()); // amount1Requested
    console.log("tx hash: ", tx.hash)
    await tx.wait(); */
    
}
//poolInfo(500, 6)

async function tokenBalance(userAddress, tokenAddress, decimals) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(tokenAddress, abi, ctx.wallet);
    let balance = await erc20Token.balanceOf(userAddress);
    return(parseInt(balance) / (10**decimals));
}


/// live net prices

// price of token amount in weth
async function getExecutionPrice(token, amount) {
    const pair = await Fetcher.fetchPairData(WETH[token.chainId], token)
    // Passing WETH as the input token, i.e., a WETH -> <token> trade.
    const route = new Route([pair], token)
    const trade = new Trade(route, new TokenAmount(token, amount), TradeType.EXACT_INPUT)

    /* if(tokenPrices[token.symbol].price != trade.nextMidPrice.toSignificant(6)){
        tokenPrices[token.symbol].priceChanged = true;
        tokenPrices[token.symbol].price = trade.nextMidPrice.toSignificant(6)
    } */
    let value = trade.nextMidPrice.toSignificant(6)
    console.log(value)
    console.log(et.eth(((value / 10000) - (value / 100000)).toFixed(15)));

}




// price of eth amount in erc20 token
async function getExecutionPriceERC20(token, amount) {
    const pair = await Fetcher.fetchPairData(token, WETH[token.chainId])
    const route = new Route([pair], WETH[token.chainId])
    const trade = new Trade(route, new TokenAmount(WETH[token.chainId], amount), TradeType.EXACT_INPUT)

    //console.log(trade.nextMidPrice.toSignificant(6))
    return trade.nextMidPrice.toSignificant(6)

    /* if(tokenPrices[token.symbol].price != trade.nextMidPrice.toSignificant(6)){
        tokenPrices[token.symbol].priceChanged = true;
        tokenPrices[token.symbol].price = trade.nextMidPrice.toSignificant(6)
    } */
}

/// ropsten network uniswap v3 and pools setup

async function newToken(name, symbol, decimals) {
    /* const Token = await hre.ethers.getContractFactory("TestERC20");
    let token = await (await Token.deploy("Test USDC c", "TESTUSDCc", 18, false)).deployed();
    let tokenAddress = (await token.deployed()).address;
    console.log(tokenAddress) */

    const ctx = await et.getTaskCtx();

    let tx = await ctx.factories.TestERC20.deploy(name, symbol, decimals, true);
    
    let result = await tx.deployed();
    console.log(`Contract: ${result.address}`);
}
newToken('AgaveCoin', 'AGVC', 18);


async function getCurrPrice() {
    const ctx = await et.getTaskCtx();
    const execInstance = new ethers.Contract(exec, execABI.abi, ctx.wallet);
    let tx = await execInstance.getPriceFull(testToken, {gasConfig});
    console.log(tx)
}
//getCurrPrice();

async function mintERC20() {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(testToken, abi, ctx.wallet);
    //let tx = await erc20Token.mint(staticSwapRouterPeriphery, et.eth('1000000'));//(100*(10**6)).toString());
    let tx = await erc20Token.mint(ctx.wallet.address, (1000000*(10**6)).toString());
    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
    await tx.wait();
    console.log('completed')
}
//mintERC20();


async function sendERC20() {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(testToken, abi, ctx.wallet);
    //let tx = await erc20Token.transfer(staticSwapRouterPeriphery, et.eth('1000'));
    let tx = await erc20Token.transfer(staticSwapRouterPeriphery, (1000 * Math.pow(10,6)));
    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
    await tx.wait();
    console.log('completed')
}
//sendERC20()


async function balance(address) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(ropstenWETH, abi, ctx.wallet);
    let balance = await erc20Token.balanceOf(address);
    console.log(parseInt(balance) / (10**18))
}
//balance('0x6FEB3C2461372e0BEdbA50f77d84B85019168D94');
//usdc pool bal - 84
//weth pool bal - 0.26
//curr usdc to eth price - 84/0.26 = 323.0769
//curr eth to usdc price - 0.26/84 = 0.00309
//curr price from exec getPriceFull - 321095099246145673903 / 1e18 = 321.0950992461457
//target price - 1779 (usdc to 1 eth)
//amount to swap to meet target price - 0.26 * 1779 = 462.54
//462.54 - 84 = 378.54


async function approveSpendV3(tokenAddress) {
    const ctx = await et.getTaskCtx();
    // const { abi, bytecode, } = require('../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(tokenAddress, erc20ABI, ctx.wallet);
    let wethToken = new ethers.Contract(ropstenWETH, erc20ABI, ctx.wallet);

    let tx = await erc20Token.approve(positionManagerAddress, et.MaxUint256);
    await tx.wait();

    tx = await erc20Token.approve(swapRouterAddress, et.MaxUint256);
    await tx.wait();

    tx = await wethToken.approve(positionManagerAddress, et.MaxUint256);
    await tx.wait(); 

    tx = await wethToken.approve(swapRouterAddress, et.MaxUint256);
    await tx.wait();
}
//approveSpendV3(testToken);


//todo: split into create pool and add liquidity functions
// WBTC
async function createAndInitPool() {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    //const token0 = testUSDC;
    //temp
    const token0 = testToken;
    const token1 = ropstenWETH;
    // WETH per token, e.g., USDC
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2300);
    //temp
    //ratio is (b, a) terms in this direction <= how much is b in terms of a
    //b cannot be negative or 1e-1
    //e.g., (1,1500) 1500 token = 1 eth, (1e14,1e6) 1 token = 0.0001 eth where token precisions matter
    //and 1e14 wei = 0.0001 eth
    //token name and symbol need to be different to avoid fail error
    //for token with 6 decimals and WETh with 18 decimals
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1e14,1e6); //ERROR check - further price ratios have to match this patterm
    //let sqrtPriceX96 = et.ratioToSqrtPriceX96(1,1500);
    let sqrtPriceX96;
    /* if (ethers.BigNumber.from(token1).lt(token0)) {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1); // (1, 15) for wbtc which is higher than weth
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500); // (15, 1) for wbtc
    } */


    if (ethers.BigNumber.from(token1).lt(token0)) {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1); // (1, 15) for wbtc which is higher than weth
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500); // (15, 1) for wbtc
    }

    const expiryDate = Math.floor(Date.now() / 1000) + 10000;
    //https://ropsten.etherscan.io/tx/0xfbc485eaa3970b443ce595824165ceb626442fa3c0afbe091af683c52e8eeaa1
    //https://ropsten.etherscan.io/tx/0xfac82000ba43dffac0ccfd86ac59f0b36872885a2058315488e7ce796b942e6b
    const createAndInitializeData = nft.interface.encodeFunctionData('createAndInitializePoolIfNecessary', [
        token0,
        token1,
        3000,
        sqrtPriceX96
    ])

    //https://ropsten.etherscan.io/tx/0x99a9c956c67228362a3464a027fbcf5374e7d10080e155fb7b6741c77972c873
    //deposit amount collected from wallet is adjusted based on
    //price ratio
    //i.e., 0.005 weth * 2300 = 11.5 usdc 

    //tick spacing
    //should be always safe: -887200 and 887200, 
    //really always safe: -886800 886800

    let mintData = nft.interface.encodeFunctionData('mint', [
        {
            token0: token1,
            token1: token0,
            tickLower: -886800,
            tickUpper: 886800,
            fee: 3000,
            recipient: ctx.wallet.address,
            amount0Desired: et.eth('0.09'),
            amount1Desired: et.eth('10'),
            /* amount0Desired: et.eth('100'),
            amount1Desired: et.eth('0.07'), */
            /* amount0Desired: et.eth('0.000008'),//wbtc is higher than weth at 1 wbtc to 15 weth
            amount1Desired: et.eth('0.0001'), */
            //amount0Desired: (100*(10**6)).toString(), for token with 6 decimals
            //amount1Desired: et.eth('0.006'), //it will correct itself based on price
            amount0Min: '0',
            amount1Min: '0',
            deadline: expiryDate,
        },
    ])

    //can also send the eth here as msg.value instead of weth
    //let tx = await nft.multicall([createAndInitializeData, mintData], 
    
    // NOTE - CREATE POOL FIRST THEN ADD LIQUIDITY SECOND

    //let tx = await nft.multicall([createAndInitializeData], gasConfig);
    
    let tx = await nft.multicall([mintData], gasConfig);
    await tx.wait()
}
//createAndInitPool();


async function createAndInitPoolNon18Decimals() {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const token0 = testToken;
    const token1 = ropstenWETH;
    let sqrtPriceX96;

    if (ethers.BigNumber.from(token1).lt(token0)) {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1000000000000); // using 1e12 to 1500 because of precision issue when adding liquidity
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1000000000000, 1500);
    }

    const expiryDate = Math.floor(Date.now() / 1000) + 10000;
    
    const createAndInitializeData = nft.interface.encodeFunctionData('createAndInitializePoolIfNecessary', [
        token0,
        token1,
        3000,
        sqrtPriceX96
    ])

    let mintData = nft.interface.encodeFunctionData('mint', [
        {
            token0: token0,
            token1: token1,
            tickLower: -886800,
            tickUpper: 886800,
            fee: 500,
            recipient: ctx.wallet.address,
            amount0Desired: (100*(Math.pow(10,6))).toString(),
            amount1Desired: et.eth('0.06'),
            amount0Min: '0',
            amount1Min: '0',
            deadline: expiryDate,
        },
    ])

    //can also send the eth here as msg.value instead of weth
    //let tx = await nft.multicall([createAndInitializeData, mintData], 
    
    // NOTE - CREATE POOL FIRST THEN ADD LIQUIDITY SECOND

    //let tx = await nft.multicall([createAndInitializeData], gasConfig);
    
    let tx = await nft.multicall([mintData], gasConfig);
    console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
    let result = await tx.wait();
    console.log(`Mined. Status: ${result.status}`);
}
//createAndInitPoolNon18Decimals()


async function swap() {
    const ctx = await et.getTaskCtx();
    //const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    // ratio to sqrt price 
    // https://github.com/euler-xyz/euler-contracts/blob/master/test/lib/eTestLib.js#L795-L804
    //token1 => token 0 ratio
    //e.g., initial price of 1 WETH for 2300 USDC

    //todo - increase ratio before swap, to avoid SPL error
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2510);
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000);
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2500);
    //todo - check error 
    //amountOut should be >= params.amountOutMinimum, 
    //otherwise router will throw 'Too little received');
    //https://ropsten.etherscan.io/tx/0x26b1a96303cb3ec0cdddfd89ddc02c03b3c6168de5896a7411a636784934397a
    const params = {
        //tokenIn: newUSDC,
        tokenIn: testToken,
        tokenOut: ropstenWETH,
        fee: 3000,
        recipient: ctx.wallet.address,
        //todo - swap very small amounts to avoid 'Too little received error
        //or set small amount out minimum
        // let the protocol decide amount to give out

        deadline: '100000000000',
        //amountIn: (0.01*(10**6)).toString(), for token with 6 decimals
        amountIn: et.eth('1'), //0.0001
        //assuming livenet price of 0.000412
        //include fee
        //amountOutMinimum: et.eth('0'),//error-correct with margin, not exact
        amountOutMinimum: 0, //et.eth('0.09'),
        sqrtPriceLimitX96: sqrtPriceX96 //0
        /* sqrtPriceLimitX96: tokenIn.toLowerCase() < tokenOut.toLowerCase()
        ? et.ratioToSqrtPriceX96(0.00000000001, 100000000000)
        : et.ratioToSqrtPriceX96(100000000000, 0.00000000001), 
        https://github.com/Uniswap/uniswap-v3-periphery/blob/0e8ffedb28909712e76b9c4a94669ca7cfc0e3e7/test/SwapRouter.spec.ts#L364
        */
    };
    let tx = await router.exactInputSingle(params, gasConfig);
    console.log("tx hash: ", tx.hash)
    await tx.wait();
}
//swap()


async function swapDecrease() {
    const ctx = await et.getTaskCtx();
    //const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    // ratio to sqrt price 
    // https://github.com/euler-xyz/euler-contracts/blob/master/test/lib/eTestLib.js#L795-L804
    //token1 => token 0 ratio
    //e.g., initial price of 1 WETH for 2300 USDC

    //todo - increase ratio before swap, to avoid SPL error
    //    const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2510);
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(2585, 1);
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(100000000000, 0.00000000001);
    //todo - check error 
    //amountOut should be >= params.amountOutMinimum, 
    //otherwise router will throw 'Too little received');
    //https://ropsten.etherscan.io/tx/0x26b1a96303cb3ec0cdddfd89ddc02c03b3c6168de5896a7411a636784934397a
    const params = {
        //tokenIn: newUSDC,
        tokenIn: ropstenWETH,
        tokenOut: testToken,
        fee: 3000,
        recipient: ctx.wallet.address,
        //swap error and increase/decrease price errors
        //TO INCREASE PRICE OF TOKEN B, SWAP A FOR B
        //TO INCREASE PRICE OF TOKEN A, SWAP B FOR A
        //todo - swap very small amounts to avoid 'Too little received error
        //or set small amount out minimum
        // let the protocol decide amount to give out

        deadline: '100000000000',
        amountIn: et.eth('0.0026'), //0.001
        //assuming livenet price of 0.000412
        //include fee
        amountOutMinimum: 0, //et.eth('17.80'),
        sqrtPriceLimitX96: 0,
    };
    let tx = await router.exactInputSingle(params, gasConfig);
    console.log("tx hash: ", tx.hash)
    await tx.wait();
}

// when token 0 price increases, i.e., 1 usdc for more eth, make token 0 scarce
// by swapping in opposite direction
//swapDecrease() 

/**
 * swapping logic
 * if price goes up, swap very high amount of er20 
 * for eth to make eth more expensive/scarce in pool and increase erc20 price
 * if price goes down, swap eth for erc20 to 
 * make erc20 more expensive/scarce in pool and decrease erc20 price 
 * compared to eth and draw it closer to 1-1
 */

 async function swapNon18Decimals() {
    const ctx = await et.getTaskCtx();
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    // const sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000);
    const params = {
        tokenIn: testToken,
        tokenOut: ropstenWETH,
        fee: 500,
        recipient: ctx.wallet.address,
        deadline: '100000000000',
        amountIn: (34.27 * Math.pow(10,6)).toString(), //for token with 6 decimals
        amountOutMinimum: 0,
        sqrtPriceLimitX96: getSqrtPrice(testToken, ropstenWETH) 
    };
    let tx = await router.exactInputSingle(params, gasConfig);
    console.log("tx hash: ", tx.hash)
    await tx.wait();
}
//swapNon18Decimals()


function getSqrtPrice(tokenIn, tokenOut) {
    let sqrtPriceX96
    if (ethers.BigNumber.from(tokenOut).lt(tokenIn)) {
        //sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1);
        sqrtPriceX96 = et.ratioToSqrtPriceX96(100000000000, 0.00000000001)
    } else {
        //sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500);
        sqrtPriceX96 = et.ratioToSqrtPriceX96(0.00000000001, 100000000000)
    }
    return sqrtPriceX96
}

function getSqrtPricfeWithRatio() {
    let sqrtPriceX96
    if (ethers.BigNumber.from(ropstenWETH).lt(testToken)) {
        console.log("not less")
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1e12);
        console.log(sqrtPriceX96.toString())
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1e12, 1500);
        console.log(sqrtPriceX96.toString())
        console.log("less")
    }
}
//getSqrtPriceWithRatio()



async function main() {
    let erc20Token = await token('USDC')
    //await getExecutionPrice(erc20Token, 1 * Math.pow(10, erc20Token.decimals))// et.eth(1));
    //await getExecutionPriceERC20(erc20Token, et.eth(1))
    //console.log(erc20Token.symbol, tokenPrices[erc20Token.symbol])
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1e6, 1e18);
    //console.log(sqrtPriceX96.toString())
    /* const formatted = formatSqrtRatioX96(sqrtPriceX96, 6, 18)
    console.log("formatted: ", formatted.toString()) */

    //SWAP BOT STEPS
    //get livenet price of eth in erc20 as target price 
    //get pool balance of token0 //erc20
    //get pool balance of token1
    //if price of token0 goes up, increase token0 balance of pool and
    //compute amount of token0 needed for swap / tokenIn as
    //Math.sqrt(token0Balance * token1Balance * targetPriceOfToken0) - token0Balance
    //if price of token0 goes down, decrease token0 balance of pool and
    //compute amount of token1 needed for swap / tokenIn as
    //Math.sqrt((token1Balance * token0Balance)/targetPriceOfToken0) - token1Balance
    //make swap with wide price margin and 0 amountOutMinimum and allow pool work out how much to release
}

//main()
/* const sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1);
console.log(sqrtPriceX96.toString()) */

//LATEST liquidity and swap
//Liquidity tx: https://ropsten.etherscan.io/tx/0xf0a41f10579f14992177ba2c2c2fe4e3f3fe84f71e789a4f1940f5be1169d046

//Swap tx: https://ropsten.etherscan.io/tx/0x10bd838bf0500880e80f6e210912f5f00eb4a79502dba1ba0cb404928aed08cc


/**

pre-bot - manual?

1. add liquidity to each pool with that price once - call every 6 hours
2. set initial minimum amounts of each token to 0
3. set initial desired amounts of each token to current value
increased by 15%


bot helper - call every 10 minutes to not overload API

1. get livenet price

bot

1. get livenet price from local
2. make a very small swap for token to WETH based on livenet price
of 1 WETH in ERC-20 token
but divide amounts to swap by 10000 or specify very small minimum out
of WETH to receive to avoid getting "too small received" error from
swap router

3. repeat bot every hour
4. error handling for router
*/

