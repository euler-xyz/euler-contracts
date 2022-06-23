const et = require('./lib/eTestLib');
const testSwaps = require('./lib/uniswap-payloads.json');

const forkAtBlock = swap => testSwaps[swap].forkAtBlock;

const borrowSetup = ctx => ([
    { action: 'setTokenBalanceInStorage', token: 'BAT', for: ctx.wallet2.address, amount: 100_000 },
    { from: ctx.wallet2, send: 'tokens.BAT.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
    { from: ctx.wallet2, send: 'eTokens.eBAT.deposit', args: [0, et.MaxUint256], },

    { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet2.address, amount: 100_000 },
    { from: ctx.wallet2, send: 'tokens.USDC.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
    { from: ctx.wallet2, send: 'eTokens.eUSDC.deposit', args: [0, et.MaxUint256], },

    { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.GRT.address], },
    { action: 'setAssetConfig', tok: 'GRT', config: { collateralFactor: .9}, },
    { action: 'setAssetConfig', tok: 'BAT', config: { borrowFactor: .5}, },
    { action: 'setAssetConfig', tok: 'USDC', config: { borrowFactor: .5}, },
])

et.testSet({
    desc: 'swap - uniswap',
    fixture: 'mainnet-fork',
    timeout: 200_000,
    preActions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'DAI', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.DAI.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eDAI.deposit', args: [0, et.MaxUint256], },

        { action: 'setTokenBalanceInStorage', token: 'GRT', for: ctx.wallet.address, amount: 1_000_000 },
        { send: 'tokens.GRT.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eGRT.deposit', args: [0, et.MaxUint256], },
    ],
})


.test({
    desc: 'basic exact input swap, DAI - RGT',
    forkAtBlock: forkAtBlock('DAI-RGT'),
    actions: ctx => [
        { send: 'swap.swapUniExactInputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amount: et.eth(5_000),
            amountOutMinimum: 0,
            payload: testSwaps['DAI-RGT'].payload,
        }]},
        //// total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eRGT.totalSupply', equals: [et.eth('627.099209553061407856')] },
        { call: 'eTokens.eRGT.totalSupplyUnderlying', equals: [et.eth('627.099209553061407856')] },
        //// account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eRGT.balanceOf', args: [ctx.wallet.address], equals: [et.eth('627.099209553061407856')] },
        { call: 'eTokens.eRGT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth('627.099209553061407856')]},
    ],
})


.test({
    desc: 'basic exact input swap, DAI - RGT, minimum amount not reached',
    forkAtBlock: forkAtBlock('DAI-RGT'),
    actions: ctx => [
        { send: 'swap.swapUniExactInputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amount: et.eth(5_000),
            amountOutMinimum: et.eth('628.1'),
            payload: testSwaps['DAI-RGT'].payload,
        }], expectError: 'e/swap/min-amount-out'},
    ],
})


.test({
    desc: 'exact input swap between subaccounts',
    forkAtBlock: forkAtBlock('DAI-RGT'),
    actions: ctx => [
        { send: 'swap.swapUniExactInputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amount: et.eth(5_000),
            amountOutMinimum: 0,
            payload: testSwaps['DAI-RGT'].payload,
        }]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eRGT.totalSupply', equals: [et.eth('627.099209553061407856')] },
        { call: 'eTokens.eRGT.totalSupplyUnderlying', equals: [et.eth('627.099209553061407856')] },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth(5_000)), },
        { call: 'eTokens.eRGT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth('627.099209553061407856')] },
        { call: 'eTokens.eRGT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth('627.099209553061407856')]},
    ],
})


.test({
    desc: 'basic exact output swap, DAI - BAT',
    forkAtBlock: forkAtBlock('DAI-BAT'),
    actions: ctx => [
        { send: 'swap.swapUniExactOutputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(200_000),
            amountInMaximum: et.eth(100_000),
            payload: testSwaps['DAI-BAT'].payload,
            path: "0x" // ignore
        }]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eBAT.totalSupply', equals: [et.eth(200_000)] },
        { call: 'eTokens.eBAT.totalSupplyUnderlying', equals: [et.eth(200_000)] },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(200_000)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(200_000)]},
    ],
})


.test({
    desc: 'basic exact output swap, DAI - BAT, maximum amount exceeded',
    forkAtBlock: forkAtBlock('DAI-BAT'),
    actions: ctx => [
        { send: 'swap.swapUniExactOutputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(200_000),
            amountInMaximum: et.eth('78444.32'),
            payload: testSwaps['DAI-BAT'].payload,
            path: "0x" // ignore
        }], expectError: 'STF'}, // safe transfer from error due to too little allowance granted to uniswap router
    ],
})


.test({
    desc: 'exact output swap between subaccounts',
    forkAtBlock: forkAtBlock('DAI-BAT'),
    actions: ctx => [
        { send: 'swap.swapUniExactOutputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(200_000),
            amountInMaximum: et.eth(100_000),
            payload: testSwaps['DAI-BAT'].payload,
            path: "0x" // ignore
        }]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eBAT.totalSupply', equals: [et.eth(200_000)] },
        { call: 'eTokens.eBAT.totalSupplyUnderlying', equals: [et.eth(200_000)] },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth('78444.327668064491635904')), },
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(200_000)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(200_000)]},
    ],
})


.test({
    desc: 'basic swap and repay, GRT - BAT',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'dTokens.dBAT.borrow', args: [0, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth(1_000_000),
            payload: testSwaps['GRT-BAT'].payload,
            path: "0x" // targetDebt will be ignored
        }, 0 // ignored because path not provided
        ]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(0)]},
        { call: 'dTokens.dBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(1_000), 1] },
    ],
})


.test({
    desc: 'basic swap and repay, GRT - BAT, maximum amount exceeded',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'dTokens.dBAT.borrow', args: [0, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth('5476.69'),
            payload: testSwaps['GRT-BAT'].payload,
            path: "0x" // targetDebt will be ignored
        }, 0 // ignored because path not provided
        ], expectError: 'STF'}, // safe transfer from error due to too little allowance granted to uniswap router
    ],
})


.test({
    desc: 'swap and repay between subaccounts',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'eTokens.eGRT.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(500_000)], },
        { send: 'markets.enterMarket', args: [1, ctx.contracts.tokens.GRT.address], },
        { send: 'dTokens.dBAT.borrow', args: [1, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth(1_000_000),
            payload: testSwaps['GRT-BAT'].payload,
            path: "0x" // targetDebt will be ignored
        }, 0 // ignored because path not provided
        ]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', assertEql: et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(500_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(500_000).sub(et.eth('5476.695110214614125399')), },
        { call: 'eTokens.eGRT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(500_000), },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(500_000), },
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(0)]},
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(0)]},
        { call: 'dTokens.dBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(1_000), 1] },
    ],
})


.test({
    desc: 'swap and repay with outstanding debt, path v2, GRT - BAT',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'dTokens.dBAT.borrow', args: [0, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth(1_000_000),
            payload: testSwaps['GRT-BAT'].payload,
            path: testSwaps['GRT-BAT'].path
        }, et.eth(1_000), // repay 2/3 of the borrowed amount
        ]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(0)]},
        { call: 'dTokens.dBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(1_000)] },
    ],
})


.test({
    desc: 'basic swap and repay with outstanding debt, path v2, GRT - BAT, maximum amount exceeded',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'dTokens.dBAT.borrow', args: [0, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth('5476.69'),
            payload: testSwaps['GRT-BAT'].payload,
            path: testSwaps['GRT-BAT'].path
        }, et.eth(1_000), // repay 2/3 of the borrowed amount
        ], expectError: 'STF'}, // safe transfer from error due to too little allowance granted to uniswap router
    ],
})


.test({
    desc: 'swap and repay between subaccounts with outstanding debt, path v2',
    forkAtBlock: forkAtBlock('GRT-BAT'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'eTokens.eGRT.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), et.eth(500_000)], },
        { send: 'markets.enterMarket', args: [1, ctx.contracts.tokens.GRT.address], },
        { send: 'dTokens.dBAT.borrow', args: [1, et.eth(3_000)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.BAT.address,
            amount: et.eth(2_000), // repay 2/3 of the borrowed amount
            amountInMaximum: et.eth(1_000_000),
            payload: testSwaps['GRT-BAT'].payload,
            path: testSwaps['GRT-BAT'].path
        }, et.eth(1_000), // repay 2/3 of the borrowed amount
        ]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', equals: [et.eth(1_000_000).sub(et.eth('5476.695110214614125399')), 1], },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(500_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(500_000).sub(et.eth('5476.695110214614125399')), 1], },
        { call: 'eTokens.eGRT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(500_000), },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(500_000), },
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(0)]},
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(0)] },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(0)]},
        { call: 'dTokens.dBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth(1_000)] },
    ],
})


.test({
    desc: 'basic exact input swap, GRT - USDC',
    forkAtBlock: forkAtBlock('GRT-USDC'),
    actions: ctx => [
        { send: 'swap.swapUniExactInputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.USDC.address,
            amount: et.eth(1_234),
            amountOutMinimum: 0,
            payload: testSwaps['GRT-USDC'].payload,
        }]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', assertEql: et.eth(1_000_000).sub(et.eth(1_234)), },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', assertEql: et.eth(1_000_000).sub(et.eth(1_234)) },
        { call: 'eTokens.eUSDC.totalSupply', equals:  [et.eth('173.902589')] },
        { call: 'eTokens.eUSDC.totalSupplyUnderlying', equals:  [et.units('173.902589', 6)] },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth(1_234)) },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth(1_234)) },
        { call: 'eTokens.eUSDC.balanceOf', args: [ctx.wallet.address], equals:  [et.eth('173.902589')] },
        { call: 'eTokens.eUSDC.balanceOfUnderlying', args: [ctx.wallet.address], equals:  [et.units('173.902589', 6)] },
    ],
})


.test({
    desc: 'swap and repay with outstanding debt, path v3, DAI - USDC',
    forkAtBlock: forkAtBlock('DAI-USDC'),
    actions: ctx => [
        ...borrowSetup(ctx),
        { send: 'dTokens.dUSDC.borrow', args: [0, et.units(10_000, 6)], },
        { send: 'swap.swapAndRepayUniPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.USDC.address,
            amount: et.units(10_000, 6), // repay debt in full
            amountInMaximum: et.eth(100_000),
            payload: testSwaps['DAI-USDC'].payload,
            path: testSwaps['DAI-USDC'].path
        }, 0, // repay debt in full
        ]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', equals: [et.eth(100_000).sub(et.eth('10000.680069720097554327')), 1], },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', equals: [et.eth(100_000).sub(et.eth('10000.680069720097554327')), 1], },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('10000.680069720097554327')), 1], },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('10000.680069720097554327')), 1], },
        { call: 'eTokens.eUSDC.balanceOf', args: [ctx.wallet.address], equals: [et.units(0, 6)] },
        { call: 'eTokens.eUSDC.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(0, 6)]},
        { call: 'dTokens.dUSDC.balanceOf', args: [ctx.wallet.address], equals: [et.units(0, 6)] },
    ],
})


.test({
    desc: 'basic exact output swap, GRT - RGT',
    forkAtBlock: forkAtBlock('GRT-RGT'),
    actions: ctx => [
        { send: 'swap.swapUniExactOutputPayload', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.GRT.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amount: et.eth(50),
            amountInMaximum: et.eth(1_000_000),
            payload: testSwaps['GRT-RGT'].payload,
            path: "0x" // ignore
        }]},
        // total supply
        { call: 'eTokens.eGRT.totalSupply', assertEql: et.eth(1_000_000).sub(et.eth('2386.198903573391097513')), },
        { call: 'eTokens.eGRT.totalSupplyUnderlying', assertEql: et.eth(1_000_000).sub(et.eth('2386.198903573391097513')) },
        { call: 'eTokens.eRGT.totalSupply', equals:  [et.eth(50)] },
        { call: 'eTokens.eRGT.totalSupplyUnderlying', equals:  [et.eth(50)] },
        // account balances 
        { call: 'eTokens.eGRT.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth('2386.198903573391097513')) },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1_000_000).sub(et.eth('2386.198903573391097513')) },
        { call: 'eTokens.eRGT.balanceOf', args: [ctx.wallet.address], equals:  [et.eth(50)] },
        { call: 'eTokens.eRGT.balanceOfUnderlying', args: [ctx.wallet.address], equals:  [et.eth(50)] },
    ],
})

.run();
