

const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const goerliConfig = require('../test/lib/token-setups/goerli');
const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const provider = ethers.provider;
const et = require("../test/lib/eTestLib");
const goerliChainId = 5; // goerli chain id
const util = require('util');
const liveConfig = require('../addresses/token-addresses-main.json');
const defaultUniswapFee = 3000;
const routerABI = require('../abis/v3SwapRouterABI.json');
const experimentalABI = require('../abis/experimentalABI.json');
const erc20ABI = require('../abis/erc20ABI.json');
const positionManagerABI = require('../abis/NonfungiblePositionManager.json');
const Decimal = require('decimal.js');

/// Goerli Uniswap V3 contracts

const factoryAddress = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const swapRouterAddress = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
const positionManagerAddress = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';


const uniswapPoolAbi = [
    'function initialize(uint160 sqrtPriceX96) external',
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives)',
];

async function poolInfo() {
    const ctx = await et.getTaskCtx();
    let pool = new ethers.Contract('0x4b51B3F4417fD7826b008B766A6BD7926Fbb6884', uniswapPoolAbi, ctx.wallet);
    let tx = await pool.slot0();
    console.log((tx.sqrtPriceX96).toString())
}
//poolInfo()



const TWO = ethers.BigNumber.from(2)
const TEN = ethers.BigNumber.from(10)
const FIVE_SIG_FIGS_POW = new Decimal(10).pow(5)

function formatSqrtRatioX96(
    sqrtRatioX96,
    decimalsToken0,
    decimalsToken1
) {
    Decimal.set({ toExpPos: 9_999_999, toExpNeg: -9_999_999 })

    let ratioNum = ((parseInt(sqrtRatioX96.toString()) / 2 ** 96) ** 2).toPrecision(5)
    let ratio = new Decimal(ratioNum.toString())

    // adjust for decimals
    if (decimalsToken1 < decimalsToken0) {
        ratio = ratio.mul(TEN.pow(decimalsToken0 - decimalsToken1).toString())
    } else if (decimalsToken0 < decimalsToken1) {
        ratio = ratio.div(TEN.pow(decimalsToken1 - decimalsToken0).toString())
    }

    if (ratio.lessThan(FIVE_SIG_FIGS_POW)) {
        return ratio.toPrecision(5)
    }

    return ratio.toString()
}

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
const newUSDC = "0x4423ccD6Cb2c523887474b9D3c4bB58E7D9E1587"
const testUSDC = "0xB6cBc9007f025F827F622DeCA580023d6eb1D7bF";
const ropstenWETH = "0xc778417E063141139Fce010982780140Aa0cD5Ab";

const tokenc = "0x26104C8663c4dB49F74E2294fcDCbF91398a99B4";//working => "0xA3eA948ca7792Fea7d252899fDe92D33c85057aE"
const tokenc_pool = "0x4b51B3F4417fD7826b008B766A6BD7926Fbb6884";//working=>"0xbb94bc38fc46868f1d7478d4c5d438c067e3c019"


nsdc = '0x315f00239015fabc162ae87D75bdEa25f5B3D8A0'

const gp = 100000000000;
const gl = 6324360;
const gasConfig = { gasPrice: gp, gasLimit: gl };


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

    console.log(trade.nextMidPrice.toSignificant(6))
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
    console.log(`Transaction: ${tx.deployTransaction.hash}`);

    let result = await tx.deployed();
    console.log(`Contract: ${result.address}`);
}
//newToken('NSD Coin 6', 'NSDC6', 18);


async function mintERC20() {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(nsdc, abi, ctx.wallet);
    let tx = await erc20Token.mint(ctx.wallet.address, et.eth(1000));//(100*(10**6)).toString());
    await tx.wait();
}
//mintERC20();

async function approveSpendV3(tokenAddress) {
    const ctx = await et.getTaskCtx();
    // const { abi, bytecode, } = require('../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    let erc20Token = new ethers.Contract(tokenAddress, erc20ABI, ctx.wallet);
    let wethToken = new ethers.Contract(ropstenWETH, erc20ABI, ctx.wallet);

    let tx = await erc20Token.approve(positionManagerAddress, et.MaxUint256);
    await tx.wait();

    tx = await erc20Token.approve(swapRouterAddress, et.MaxUint256);
    await tx.wait();

    /* tx = await wethToken.approve(positionManagerAddress, et.MaxUint256);
    await tx.wait(); 

    tx = await wethToken.approve(swapRouterAddress, et.MaxUint256);
    await tx.wait();  */
}
//approveSpendV3(nsdc);


//todo: split into create pool and add liquidity functions
async function createAndInitPool() {
    const ctx = await et.getTaskCtx();
    const nft = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    //const token0 = testUSDC;
    //temp
    const token0 = nsdc;
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
    if (ethers.BigNumber.from(token1).lt(token0)) {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1500, 1);
    } else {
        sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 1500);
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
            token0: token0,
            token1: token1,
            tickLower: -886800,
            tickUpper: 886800,
            fee: 3000,
            recipient: ctx.wallet.address,
            amount0Desired: et.eth('100'),
            amount1Desired: et.eth('0.06'),
            //amount0Desired: (100*(10**6)).toString(), for token with 6 decimals
            //amount1Desired: et.eth('0.006'), //it will correct itself based on price
            amount0Min: '0',
            amount1Min: '0',
            deadline: expiryDate,
        },
    ])

    //can also send the eth here as value instead of weth
    //let tx = await nft.multicall([createAndInitializeData, mintData], 
    //let tx = await nft.multicall([createAndInitializeData], gasConfig);
    let tx = await nft.multicall([mintData], gasConfig);
    await tx.wait()
}
//newToken('Reputation', 'REP', 18);
//mintERC20();
//approveSpendV3(nsdc);
createAndInitPool();


async function swap() {
    const ctx = await et.getTaskCtx();
    const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    // ratio to sqrt price 
    // https://github.com/euler-xyz/euler-contracts/blob/master/test/lib/eTestLib.js#L795-L804
    //token1 => token 0 ratio
    //e.g., initial price of 1 WETH for 2300 USDC

    //todo - increase ratio before swap, to avoid SPL error
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2510);
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(0.000000001, 1000000000);
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2500);
    //todo - check error 
    //amountOut should be >= params.amountOutMinimum, 
    //otherwise router will throw 'Too little received');
    //https://ropsten.etherscan.io/tx/0x26b1a96303cb3ec0cdddfd89ddc02c03b3c6168de5896a7411a636784934397a
    const params = {
        //tokenIn: newUSDC,
        tokenIn: nsdc,
        tokenOut: ropstenWETH,
        fee: 3000,
        recipient: ctx.wallet.address,
        //todo - swap very small amounts to avoid 'Too little received error
        //or set small amount out minimum
        // let the protocol decide amount to give out

        deadline: '100000000000',
        //amountIn: (0.01*(10**6)).toString(), for token with 6 decimals
        amountIn: et.eth('0.0025'), //0.0001
        //assuming livenet price of 0.000412
        //include fee
        //amountOutMinimum: et.eth('0'),//error-correct with margin, not exact
        amountOutMinimum: et.eth('0.000001'),
        sqrtPriceLimitX96: sqrtPriceX96,
    };
    let tx = await router.exactInputSingle(params, gasConfig);
    console.log("tx hash: ", tx.hash)
    await tx.wait();
}
//swap()


async function swapIncrease() {
    const ctx = await et.getTaskCtx();
    const factory = new ethers.Contract(factoryAddress, experimentalABI, ctx.wallet);
    const positionManager = new ethers.Contract(positionManagerAddress, positionManagerABI, ctx.wallet);
    const router = new ethers.Contract(swapRouterAddress, routerABI, ctx.wallet);
    // ratio to sqrt price 
    // https://github.com/euler-xyz/euler-contracts/blob/master/test/lib/eTestLib.js#L795-L804
    //token1 => token 0 ratio
    //e.g., initial price of 1 WETH for 2300 USDC

    //todo - increase ratio before swap, to avoid SPL error
    //    const sqrtPriceX96 = et.ratioToSqrtPriceX96(1, 2510);
    const sqrtPriceX96 = et.ratioToSqrtPriceX96(2585, 1);
    //todo - check error 
    //amountOut should be >= params.amountOutMinimum, 
    //otherwise router will throw 'Too little received');
    //https://ropsten.etherscan.io/tx/0x26b1a96303cb3ec0cdddfd89ddc02c03b3c6168de5896a7411a636784934397a
    const params = {
        //tokenIn: newUSDC,
        tokenIn: ropstenWETH,
        tokenOut: tokenc,
        fee: 3000,
        recipient: ctx.wallet.address,
        //swap error and increase/decrease price errors
        //TO INCREASE PRICE OF TOKEN B, SWAP A FOR B
        //TO INCREASE PRICE OF TOKEN A, SWAP B FOR A
        //todo - swap very small amounts to avoid 'Too little received error
        //or set small amount out minimum
        // let the protocol decide amount to give out

        deadline: '100000000000',
        amountIn: et.eth('0.00000003'), //0.001
        //assuming livenet price of 0.000412
        //include fee
        amountOutMinimum: et.eth('0.00001'),
        sqrtPriceLimitX96: sqrtPriceX96,
    };
    let tx = await router.exactInputSingle(params, gasConfig);
    console.log("tx hash: ", tx.hash)
    await tx.wait();
}

// when token 0 price increases, i.e., 1 usdc for more eth, make token 0 scarce
// by swapping in opposite direction
//swapIncrease() 



async function main() {
    //let erc20Token = await token('USDT')
    //await getExecutionPrice(erc20Token, 1 * Math.pow(10, erc20Token.decimals))// et.eth(1));
    //await getExecutionPriceERC20(erc20Token, et.eth(1))
    //console.log(erc20Token.symbol, tokenPrices[erc20Token.symbol])
    //const sqrtPriceX96 = et.ratioToSqrtPriceX96(1e6, 1e18);
    //console.log(sqrtPriceX96.toString())
    /* const formatted = formatSqrtRatioX96(sqrtPriceX96, 6, 18)
    console.log("formatted: ", formatted.toString()) */
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

