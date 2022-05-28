const et = require('./lib/eTestLib');

// new router ABI
const SwapRouterABI = require('./vendor-artifacts/SwapRouter02.json').abi;
const SwapRouterAddress = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';

// v2 router ABI
const SwapRouterV2ABI = require('./vendor-artifacts/SwapRouterV2.json').abi;
const SwapRouterV2Address = '0x7a250d5630b4cf539739df2c5dacb4c659f2488d';

const UniswapV2PairABI = require('./vendor-artifacts/UniswapV2Pair.json').abi;
const DAIWETHPairAddress = "0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11";
const BATWETHPairAddress = "0xB6909B960DbbE7392D405429eB2b3649752b4838";

// test input
const exactOutput = et.eth(20_000);
const maxIn = et.eth(100_000);
const path = [
    '0x6b175474e89094c44da98b954eedeac495271d0f', // DAI
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // WETH
    '0x0d8775f648430679a709e98d2b0cb6250d2887ef', // BAT
];

et.testSet({
    desc: 'uniswap exact output',
    fixture: 'mainnet-fork',
    forkAtBlock: 14850100,
    timeout: 200_000,
    preActions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'DAI', for: ctx.wallet.address, amount: 100_000 },
        { action: 'cb', cb: async (ctx) => {
            // new router 
            ctx.contracts.swapRouter = new et.ethers.Contract(SwapRouterAddress, SwapRouterABI, ctx.wallet);

            // v2 router
            ctx.contracts.swapRouterV2 = new et.ethers.Contract(SwapRouterV2Address, SwapRouterV2ABI, ctx.wallet);
        }},
        { send: 'tokens.DAI.approve', args: [SwapRouterAddress, et.MaxUint256], },
        { send: 'tokens.DAI.approve', args: [SwapRouterV2Address, et.MaxUint256], },
    ],
})

.test({
    desc: 'new router - exact output not equal requested amount',
    
    actions: ctx => [
        { action: 'cb', cb: async (ctx) => {
            ctx.contracts.DAIWETHPair = new et.ethers.Contract(DAIWETHPairAddress, UniswapV2PairABI, ctx.wallet);
            ctx.contracts.BATWETHPair = new et.ethers.Contract(BATWETHPairAddress, UniswapV2PairABI, ctx.wallet);

            let reserves = await ctx.contracts.DAIWETHPair.getReserves();
            const DAIWETH_rDAI = reserves._reserve0;
            const DAIWETH_rWETH = reserves._reserve1;

            reserves = await ctx.contracts.BATWETHPair.getReserves();
            const BATWETH_rBAT = reserves._reserve0;
            const BATWETH_rWETH = reserves._reserve1;

            console.log(`DAI/WETH DAI reserves: ${DAIWETH_rDAI.toString()}`);
            console.log(`DAI/WETH WETH reserves: ${DAIWETH_rWETH.toString()}`);
            console.log(`BAT/WETH DAI reserves: ${BATWETH_rBAT.toString()}`);
            console.log(`BAT/WETH WETH reserves: ${BATWETH_rWETH.toString()}`);
            console.log();

            // first step, calculating backwards to get DAI amount in
            console.log(`BAT -> wallet: ${exactOutput.toString()}`);

            let numerator = BATWETH_rWETH.mul(exactOutput).mul(1000);
            let denominator = BATWETH_rBAT.sub(exactOutput).mul(997);
            let amount = numerator.div(denominator).add(1);
            console.log(`WETH -> BAT/WETH: ${amount.toString()}`);

            numerator = DAIWETH_rDAI.mul(amount).mul(1000);
            denominator = DAIWETH_rWETH.sub(amount).mul(997);
            amount = numerator.div(denominator).add(1);
            console.log(`DAI -> DAI/WETH: ${amount.toString()}`);
            console.log();

            // second step, calculating forward to get final BAT amount out
            console.log(`DAI -> DAI/WETH: ${amount.toString()}`);

            amount = amount.mul(997);
            numerator = amount.mul(DAIWETH_rWETH);
            denominator = DAIWETH_rDAI.mul(1000).add(amount);
            amount = numerator.div(denominator);
            console.log(`WETH -> BAT/WETH: ${amount.toString()}`);

            amount = amount.mul(997);
            numerator = amount.mul(BATWETH_rBAT);
            denominator = BATWETH_rWETH.mul(1000).add(amount);
            amount = numerator.div(denominator);
            console.log(`BAT -> wallet: ${amount.toString()}`);         
        }},
    ],
})

.test({
    desc: 'V2 router - exact output equals requested amount',
    
    actions: ctx => [
        { call: 'swapRouterV2.swapTokensForExactTokens', args: [exactOutput, maxIn, path, ctx.wallet.address, Math.round(Date.now()/1000) + 1800]},
        
        // we should end up with requested 20_000 BAT
        { call: 'tokens.BAT.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(20_000), },
    ],
})

.test({
    desc: 'new router - exact output not equal requested amount',
    
    actions: ctx => [
        { call: 'swapRouter.swapTokensForExactTokens', args: [exactOutput, maxIn, path, ctx.wallet.address]},
        
        // we should end up with requested 20_000 BAT
        { call: 'tokens.BAT.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(20_000), },
    ],
})

.run();
