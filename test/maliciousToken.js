const et = require('./lib/eTestLib');

const getRepayPreFees = async (ctx, amount) => {
    const reserveFee = await ctx.contracts.liquidation.UNDERLYING_RESERVES_FEE()
    return amount.mul(et.eth(1)).mul(et.eth(1)).div(et.eth(1).add(reserveFee)).div(et.eth(1))
}

const setupLiquidation = ctx => [
    { action: 'setIRM', underlying: 'TST', irm: 'IRM_LINEAR', },
    { action: 'setIRM', underlying: 'TST3', irm: 'IRM_LINEAR', },
    { action: 'setIRM', underlying: 'TST11', irm: 'IRM_LINEAR', },

    { action: 'setAssetConfig', tok: 'TST', config: { borrowFactor: .4}, },
    { action: 'setAssetConfig', tok: 'TST3', config: { borrowFactor: .4}, },
    { action: 'setAssetConfig', tok: 'TST11', config: { borrowFactor: .4}, },

    { send: 'dTokens.dTST3.borrow', args: [0, et.eth(29)], },
    { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.5', },
    { callStatic: 'liquidation.checkLiquidation', args: [ctx.wallet3.address, ctx.wallet.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address],
        onResult: r => {
            et.equals(r.healthScore, 0.50, 0.02);
            ctx.stash.repay = r.repay;
            ctx.stash.yield = r.yield;
        },
    },
]

const verifyLiquidation = ctx => [
    { from: ctx.wallet3, send: 'liquidation.liquidate', args: [ctx.wallet.address, ctx.contracts.tokens.TST3.address, ctx.contracts.tokens.TST.address, () => ctx.stash.repay, 0], },
    // liquidator:
    { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet3.address], equals: () => ctx.stash.repay, },
    { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], equals: () => [et.eth(1000).add(ctx.stash.yield), '0.000001'], },

    // violator:
    { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], equals: async () => [et.eth(29).sub(await getRepayPreFees(ctx, ctx.stash.repay)), '0.1'] },
    { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals:  () => [et.eth(100).sub(ctx.stash.yield), '0.000001'], },
    { call: 'exec.liquidity', args: [ctx.wallet.address], onResult: async r => {
        const targetHealthScore = await ctx.contracts.liquidation.TARGET_HEALTH()
        et.equals(r.collateralValue / r.liabilityValue, targetHealthScore / 1e18, 0.0001);
    }},
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
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(100)], expectError: 'e/insufficient-balance', },
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(100).sub(et.DefaultReserve)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: [et.eth(200), et.formatUnits(et.DefaultReserve)], },   
    ],
})


.test({
    desc: "transferFrom returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/return-void', []], },   
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equal: [et.eth(200), et.formatUnits(et.DefaultReserve)], },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
    ],
})


.test({
    desc: "borrow - transfer reverts",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/revert', []] },   
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], expectError: 'revert behaviour', },
    ],
})


.test({
    desc: "withdraw - transfer reverts",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/revert', []] },   
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(1)], expectError: 'revert behaviour', },
    ],
})


.test({
    desc: "repay - transfer from reverts",
    actions: ctx => [
        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { send: 'tokens.TST.mint', args: [ctx.wallet3.address, et.eth(1)], },
        { send: 'tokens.TST.configure', args: ['transfer-from/revert', []] }, 
        { from: ctx.wallet3, send: 'dTokens.dTST.repay', args: [0, et.eth(1)], expectError: 'revert behaviour', },
    ],
})


.test({
    desc: "deposit - transfer from reverts",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/revert', []] }, 
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], expectError: 'revert behaviour', },
    ],
})


.test({
    desc: "deposit - overflow",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/inflationary', et.abiEncode(['uint256'], [et.MaxUint256.sub(et.eth(1))])] }, 
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], expectError: 'e/negative-transfer-amount', },
    ],
})


.test({
    desc: "deposit - transfer from reenters",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/call', et.abiEncode(
            ['address', 'bytes'],
            [
                ctx.contracts.eTokens.eTST.address,
                ctx.contracts.eTokens.eTST.interface.encodeFunctionData('withdraw', [ctx.wallet.address, et.eth(1)]),
            ]
        )]}, 
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], expectError: 'e/reentrancy', },
    ],
})


.test({
    desc: "deposit - transfer from reenters view method",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/call', et.abiEncode(
            ['address', 'bytes'],
            [
                ctx.contracts.eTokens.eTST.address,
                ctx.contracts.eTokens.eTST.interface.encodeFunctionData('balanceOfUnderlying', [ctx.wallet.address]),
            ]
        )]},
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], expectError: 'e/ro-reentrancy', },
    ],
})


.test({
    desc: "withdraw - underflow",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/underflow', []] }, 
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(100)], expectError: 'e/negative-transfer-amount', },
    ],
})


.test({
    desc: "can liquidate - transfer reverts",
    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['transfer/revert', []], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - transfer from reverts",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['transfer-from/revert', []], },
        ...verifyLiquidation(ctx),
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
        { send: 'tokens.TST3.configure', args: ['balance-of/set-amount', et.abiEncode(['uint256'], [et.MaxUint256])], },
        ...verifyLiquidation(ctx),
    ],
})


.test({
    desc: "can liquidate - balance of returns 0",

    actions: ctx => [
        ...setupLiquidation(ctx),
        { send: 'tokens.TST3.configure', args: ['balance-of/set-amount', et.abiEncode(['uint256'], [0])], },
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
    desc: "deflationary - deposit, borrow, burn repay, withdraw",

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

        { send: 'tokens.TST11.mint', args: [ctx.wallet.address, et.eth(3)], },
        { send: 'eTokens.eTST11.deposit', args: [0, et.eth(3)], },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(2), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet.address], equals: [et.eth(2), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST11.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth('1.999999999999999999'), },
        { send: 'eTokens.eTST11.burn', args: [0, et.eth(2)], expectError: 'e/insufficient-balance', },

        { send: 'tokens.TST11.mint', args: [ctx.wallet.address, et.eth(2)], },
        { send: 'eTokens.eTST11.deposit', args: [0, et.eth(2)], },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet.address], equals: [et.eth(3), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eTST11.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth('2.999999999999999999'), },
        { send: 'eTokens.eTST11.burn', args: [0, et.eth(2)], },

        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(10), },
        { call: 'dTokens.dTST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet.address], equals: [et.eth(1), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },

        { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(9)], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(8)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(2), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], equals: [et.eth(1), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(7), },
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

        { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(11)], expectError: 'e/insufficient-balance', },
        { from: ctx.wallet2, send: 'eTokens.eTST11.withdraw', args: [0, et.eth(10)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1), },
        { call: 'eTokens.eTST11.balanceOf', args: [ctx.wallet2.address], equals: [et.eth(1), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST11.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(11), },
    ],
})

.run();
