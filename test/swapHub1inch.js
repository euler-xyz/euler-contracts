const et = require('./lib/eTestLib');
const testSwaps = require('./lib/1inch-payloads.json');

const getPayload = (swap, receiver) =>
    testSwaps[swap].payload.replace(/\{receiverAddress\}/g, receiver.slice(2));

const forkAtBlock = swap => testSwaps[swap].forkAtBlock;


et.testSet({
    desc: 'swapHub - 1inch handler',
    fixture: 'mainnet-fork',
    timeout: 200_000,
    forkAtBlock: forkAtBlock('BAT-USDT'),
    preActions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'BAT', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.BAT.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eBAT.deposit', args: [0, et.MaxUint256], },

        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { send: 'tokens.USDC.approve', args: [ctx.contracts.euler.address, et.MaxUint256], },
        { send: 'eTokens.eUSDC.deposit', args: [0, et.MaxUint256], },
    ],
})


.test({
    desc: 'basic swap, BAT - USDT',
    actions: ctx => [
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.swapHandler1Inch.address, {
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amountIn: et.eth('25048.11267549'),
            amountOut: 0,
            mode: 0,
            exactOutTolerance: 0,
            payload: getPayload('BAT-USDT', ctx.contracts.euler.address),
        }]},
        // total supply
        { call: 'eTokens.eBAT.totalSupply', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001]},
        { call: 'eTokens.eBAT.totalSupplyUnderlying', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.totalSupply', equals: [et.eth('29921.938245'), 0.000001] },
        { call: 'eTokens.eUSDT.totalSupplyUnderlying', equals: [et.units('29921.938245', 6), 0.000001] },
        // account balances 
        { call: 'eTokens.eBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.balanceOf', args: [ctx.wallet.address], equals: [et.eth('29921.938245'), 0.000001] },
        { call: 'eTokens.eUSDT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units('29921.938245', 6), 0.000001]},
        // handler balances
        { call: 'tokens.BAT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
        { call: 'tokens.USDT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
    ],
})


.test({
    desc: 'basic swap, BAT - USDT, exact out mode',
    actions: ctx => [
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.swapHandler1Inch.address, {
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amountIn: et.MaxUint256,
            amountOut: et.units('29921', 6), // rounded amount out
            mode: 1,
            exactOutTolerance: et.units('1', 6),
            payload: getPayload('BAT-USDT', ctx.contracts.euler.address),
        }]},
        // total supply
        { call: 'eTokens.eBAT.totalSupply', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001]},
        { call: 'eTokens.eBAT.totalSupplyUnderlying', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.totalSupply', equals: [et.eth('29921.938245'), 0.000001] },
        { call: 'eTokens.eUSDT.totalSupplyUnderlying', equals: [et.units('29921.938245', 6), 0.000001] },
        // account balances 
        { call: 'eTokens.eBAT.balanceOf', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.balanceOf', args: [ctx.wallet.address], equals: [et.eth('29921.938245'), 0.000001] },
        { call: 'eTokens.eUSDT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units('29921.938245', 6), 0.000001]},
        // handler balances
        { call: 'tokens.BAT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
        { call: 'tokens.USDT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
    ],
})


.test({
    desc: 'basic swap, BAT - USDT, minimum amount not reached',
    actions: ctx => [
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.swapHandler1Inch.address, {
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amountIn: et.eth('25048.11267549'),
            amountOut: et.units(30000, 6),
            mode: 0,
            exactOutTolerance: 0,
            payload: getPayload('BAT-USDT', ctx.contracts.euler.address),
        }], expectError: 'e/swap-hub/insufficient-output'},
    ],
})


.test({
    desc: 'swap between subaccounts',
    actions: ctx => [
        { send: 'swapHub.swap', args: [0, 1, ctx.contracts.swapHandlers.swapHandler1Inch.address, {
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amountIn: et.eth('25048.11267549'),
            amountOut: 0,
            mode: 0,
            exactOutTolerance: 0,
            payload: getPayload('BAT-USDT', ctx.contracts.euler.address)
        }]},
        // total supply
        { call: 'eTokens.eBAT.totalSupply', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eBAT.totalSupplyUnderlying', equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.totalSupply', equals: [et.eth('29921.938245'), 0.000001] }, 
        { call: 'eTokens.eUSDT.totalSupplyUnderlying', equals: [et.units('29921.938245', 6), 0.000001] },
        // account balances 
        { call: 'eTokens.eBAT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eBAT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 0)], equals: [et.eth(100_000).sub(et.eth('25048.11267549')), 0.000001], },
        { call: 'eTokens.eUSDT.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.eth('29921.938245'), 0.000001] },
        { call: 'eTokens.eUSDT.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], equals: [et.units('29921.938245', 6), 0.000001] },
        // handler balances
        { call: 'tokens.BAT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
        { call: 'tokens.USDT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
    ],
})


.test({
    desc: 'basic swap, USDC - RGT',
    forkAtBlock: forkAtBlock('USDC-RGT'),
    actions: ctx => [
        { send: 'swapHub.swap', args: [0, 0, ctx.contracts.swapHandlers.swapHandler1Inch.address, {
            underlyingIn: ctx.contracts.tokens.USDC.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amountIn: et.units('50000', 6),
            amountOut: 0,
            mode: 0,
            exactOutTolerance: 0,
            payload: getPayload('USDC-RGT', ctx.contracts.euler.address),
        }]},
        // total supply
        { call: 'eTokens.eUSDC.totalSupply', equals: [et.eth(100_000).sub(et.eth('50000')), 0.000001], },
        { call: 'eTokens.eUSDC.totalSupplyUnderlying', equals: [et.units(100_000, 6).sub(et.units('50000', 6)), 0.000001] },
        { call: 'eTokens.eRGT.totalSupply', equals:  ['1263.349469909703714654', 1] },
        { call: 'eTokens.eRGT.totalSupplyUnderlying', equals:  ['1263.349469909703714654', 1] },
        // account balances 
        { call: 'eTokens.eUSDC.balanceOf', args: [ctx.wallet.address], equals: [et.eth(100_000).sub(et.eth('50000')), 0.000001] },
        { call: 'eTokens.eUSDC.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(100_000, 6).sub(et.units('50000', 6)), 0.000001] },

        { call: 'eTokens.eRGT.balanceOf', args: [ctx.wallet.address], equals:  ['1263.349469909703714654', 1] },
        { call: 'eTokens.eRGT.balanceOfUnderlying', args: [ctx.wallet.address], equals:  ['1263.349469909703714654', 1] },
        // handler balances
        { call: 'tokens.USDC.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
        { call: 'tokens.RGT.balanceOf', args: [ctx.contracts.swapHandlers.swapHandler1Inch.address], assertEql: 0 },
    ],
})


.run();
