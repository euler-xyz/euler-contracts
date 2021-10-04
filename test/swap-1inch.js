const et = require('./lib/eTestLib');
const testSwaps = require('./lib/1inch-payloads.json');

const getPayload = (swap, eulerAddress) =>
    testSwaps[swap].payload.replace(/\{eulerAddress\}/g, eulerAddress.slice(2));
const forkAtBlock = swap => testSwaps[swap].forkAtBlock;


et.testSet({
    desc: 'swap - 1inch',
    fixture: 'mainnet-fork',
    timeout: 200_000,
    forkAtBlock: forkAtBlock('DAI-CVP'),
    preActions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.USDC.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eUSDC.deposit', args: [0, et.MaxUint256], },

        { action: 'setTokenBalanceInStorage', token: 'DAI', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.DAI.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eDAI.deposit', args: [0, et.MaxUint256], },

        { action: 'setTokenBalanceInStorage', token: 'UNI', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.UNI.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eUNI.deposit', args: [0, et.MaxUint256], },
    ],
})


.test({
    desc: 'basic swap, DAI - CVP',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.eth('25044.046220061052072038'),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address),
        }]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eCVP.totalSupply', equals: ['7792.089489987746688776', 100] }, // account for slippage from other txs in the block not included in test
        { call: 'eTokens.eCVP.totalSupplyUnderlying', equals: ['7792.089489987746688776', 100] },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eCVP.balanceOf', args: [ctx.wallet.address], equals: ['7792.089489987746688776', 100] },
        { call: 'eTokens.eCVP.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['7792.089489987746688776', 100] },
    ],
})


.test({
    desc: 'swap between subaccounts',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.eth('25044.046220061052072038'),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address)
        }]},
        // total supply
        { call: 'eTokens.eDAI.totalSupply', assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eDAI.totalSupplyUnderlying', assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eCVP.totalSupply', equals: ['7792.089489987746688776', 100] }, 
        { call: 'eTokens.eCVP.totalSupplyUnderlying', equals: ['7792.089489987746688776', 100] },
        // account balances 
        { call: 'eTokens.eDAI.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], assertEql: et.eth(100_000).sub(et.eth('25044.046220061052072038')), },
        { call: 'eTokens.eCVP.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: ['7792.089489987746688776', 100] },
        { call: 'eTokens.eCVP.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: ['7792.089489987746688776', 100] },
    ],
})


.test({
    desc: 'underlying in vs payload mismatch',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.UNI.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.eth('25044.046220061052072038'),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address)
        }], expectError: 'Dai/insufficient-allowance' },
    ],
})


.test({
    desc: 'underlying out vs payload mismatch',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.USDC.address,
            amountIn: et.eth('25044.046220061052072038'),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address)
        }], expectError: 'e/swap/balance-out' },
    ],
})


.test({
    desc: 'amount in greater than payload',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.eth(50_000),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address)
        }], expectError: 'e/swap/balance-in' },
    ],
})


.test({
    desc: 'amount in less than payload',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.DAI.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.eth(100),
            payload: getPayload('DAI-CVP', ctx.contracts.euler.address)
        }], expectError: 'Dai/insufficient-allowance' },
    ],
})


.test({
    desc: 'basic swap, USDC - CVP',
    forkAtBlock: forkAtBlock('USDC-CVP'),
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.USDC.address,
            underlyingOut: ctx.contracts.tokens.CVP.address,
            amountIn: et.units('24650.225158', 6),
            payload: getPayload('USDC-CVP', ctx.contracts.euler.address),
        }]},
        // total supply
        { call: 'eTokens.eUSDC.totalSupply', assertEql: et.eth(100_000).sub(et.eth('24650.225158')), },
        { call: 'eTokens.eUSDC.totalSupplyUnderlying', assertEql: et.units(100_000, 6).sub(et.units('24650.225158', 6)) },
        { call: 'eTokens.eCVP.totalSupply', equals:  ['7776.831902407225176825', 100] },
        { call: 'eTokens.eCVP.totalSupplyUnderlying', equals:  ['7776.831902407225176825', 100] },
        // account balances 
        { call: 'eTokens.eUSDC.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(100_000).sub(et.eth('24650.225158')) },
        { call: 'eTokens.eUSDC.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(100_000, 6).sub(et.units('24650.225158', 6)) },

        { call: 'eTokens.eCVP.balanceOf', args: [ctx.wallet.address], equals:  ['7776.831902407225176825', 100] },
        { call: 'eTokens.eCVP.balanceOfUnderlying', args: [ctx.wallet.address], equals:  ['7776.831902407225176825', 100] },
    ],
})


.run();
