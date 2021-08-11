// NOTICE available test token behaviours
// balance-of/consume-all-gas  
// balance-of/max-value        
// balance-of/zero        
// balance-of/revert           
// balance-of/panic            
// approve/return-void         
// transfer/return-void        
// transfer-from/return-void   
// transfer/deflationary       
// transfer/inflationary       

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
    { from: ctx.wallet3, send: 'liquidation.liquidate', args: [ctx.wallet.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address, et.eth('26.512843978264064943'), 0], },
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


.test({
    desc: "can liquidate - balance of consumes all gas",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/consume-all-gas', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - balance of returns max uint",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/max-value', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - balance of returns 0",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/zero', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - balance of reverts",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/revert', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - balance of panics",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/panic', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - self destruct",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.callSelfDestruct', },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "deflationary - deposit, borrow, repay, withdraw",

    actions: ctx => [
        { action: 'setIRM', underlying: 'TST11', irm: 'IRM_ZERO', },
        { send: 'tokens.TST11.configure', args: ['transfer/deflationary', et.abiEncode(['uint256'], [et.eth(1)])], },

        { from: ctx.wallet2, send: 'tokens.TST11.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'tokens.TST11.mint', args: [ctx.wallet2.address, et.eth(10)], },
        { from: ctx.wallet2, send: 'eTokens.eTST11.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST11.address], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(9), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(9), },

        { send: 'dTokens.dTST11.borrow', args: [0, et.eth(5)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(4), },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(5), },

        { send: 'tokens.TST11.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'dTokens.dTST11.repay', args: [0, et.eth(4)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(2), },

        // because repay pulls min(owed, amount), currently its not possible to repay a loan in full 

//         { send: 'tokens.TST11.mint', args: [ctx.wallet.address, et.eth(3)], },
//         { send: 'dTokens.dTST11.repay', args: [0, et.eth(3)], },
//         { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(9), },
//         { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },

//         { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(9)], },
//         { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(0), },
//         { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
//         { call: 'tokens.TST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(8), },
    ],
})


.test({
    desc: "inflationary - deposit, borrow, repay, withdraw",

    actions: ctx => [
        { action: 'setIRM', underlying: 'TST11', irm: 'IRM_ZERO', },
        { send: 'tokens.TST11.configure', args: ['transfer/inflationary', et.abiEncode(['uint256'], [et.eth(1)])], },

        { from: ctx.wallet2, send: 'tokens.TST11.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet2, send: 'tokens.TST11.mint', args: [ctx.wallet2.address, et.eth(10)], },
        { from: ctx.wallet2, send: 'eTokens.eTST11.deposit', args: [0, et.eth(10)], },
        { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST11.address], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(11), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(11), },

        { send: 'dTokens.dTST11.borrow', args: [0, et.eth(5)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(6), },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(5), },

        { send: 'tokens.TST11.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { send: 'dTokens.dTST11.repay', args: [0, et.eth(4)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(2), },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(11)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(0), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(12), },
    ],
})

.run();
