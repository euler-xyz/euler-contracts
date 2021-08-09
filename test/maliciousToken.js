const et = require('./lib/eTestLib');

const setupLiquidation = ctx => [
    { send: 'dTokens.dTST3.borrow', args: [0, et.eth(30)], },
    { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.5', },
    { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet3.address, ctx.wallet.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address],
        onResult: r => {
            et.equals(r.healthScore, 0.49, 0.01);
            et.equals(r.repay, '26.512843978264064943');
            et.equals(r.yield, '70.0021795440141639');
        },
    },
]

const verifyLiquidation = ctx => [
    // liquidator:
    { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: et.eth('26.512843978264064943'), },
    { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], equals: '1070.002179544014163897', },

    // violator:
    { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], equals: et.eth('3.749659513077760244'), },
    { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: et.eth('29.997820455985836103'), },
    { callStatic: 'exec.liquidity', args: [ctx.wallet.address], onResult: r => {
        et.equals(r.collateralValue / r.liabilityValue, 1.2, 0.0001);
    }},

    // reserves:
    { call: 'eTokens.eTST3.reserveBalanceUnderlying', args: [], equals: et.eth('0.262503414287030621'), },
]


et.testSet({
    desc: "malicious token",

    preActions: ctx => {
        let actions = [];

        actions.push({ send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(200)], });
        actions.push({ send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });
        actions.push({ send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },);

        actions.push({ from: ctx.wallet2, send: 'tokens.TST3.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet2, send: 'tokens.TST3.mint', args: [ctx.wallet2.address, et.eth(100)], });
        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST3.deposit', args: [0, et.eth(100)], });
        
        actions.push({ from: ctx.wallet3, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet3, send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(1000)], });
        actions.push({ from: ctx.wallet3, send: 'eTokens.eTST.deposit', args: [0, et.eth(1000)], });
        actions.push({ from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },);

        return actions;
    },
})

// balance-of/consume-all-gas  
// balance-of/max-value        
// balance-of/revert           
// balance-of/panic            
// approve/return-void         
// transfer/return-void        
// transfer-from/return-void   
// transfer/deflationary       
// transfer/inflationary       

.test({
    desc: "transfer returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/return-void', []], },   
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(100)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(200), },   
    ],
})


.test({
    desc: "transferFrom returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/return-void', []], },   
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(200), },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
    ],
})


// Panics on calculateExchangeRate with no borrows
// .test({
//     desc: "balanceOf consumes all gas",
//     actions: ctx => [
//         { send: 'tokens.TST.configure', args: ['balance-of/consume-all-gas', []], },   
//         { send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], },
//         { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(200), },   
//         { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
//     ],
// })


.test({
    desc: "can liquidate - balance of consumes all gas",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/consume-all-gas', []], },
        { from: ctx.wallet3, send: 'liquidation.liquidate', args: [ctx.wallet.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address, et.eth('26.512843978264064943'), 0], },
        ...verifyLiquidation(ctx),
    ],
})

.run();
