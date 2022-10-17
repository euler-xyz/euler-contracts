const et = require('./lib/eTestLib');
const testSwaps = require('./lib/1inch-payloads.json');

const getPayload = (swap, receiver) =>
    testSwaps[swap].payload.replace(/\{receiverAddress\}/g, receiver.slice(2));

const forkAtBlock = swap => testSwaps[swap].forkAtBlock;


et.testSet({
    desc: 'swap - 1inch',
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
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amount: et.eth('25048.11267549'),
            amountOutMinimum: 0,
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
    ],
})


.test({
    desc: 'basic swap, BAT - USDT, minimum amount not reached',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amount: et.eth('25048.11267549'),
            amountOutMinimum: et.units(30000, 6),
            payload: getPayload('BAT-USDT', ctx.contracts.euler.address),
        }], expectError: 'e/swap/min-amount-out'},
    ],
})


.test({
    desc: 'swap between subaccounts',
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 1,
            underlyingIn: ctx.contracts.tokens.BAT.address,
            underlyingOut: ctx.contracts.tokens.USDT.address,
            amount: et.eth('25048.11267549'),
            amountOutMinimum: 0,
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
    ],
})


.test({
    desc: 'basic swap, USDC - RGT',
    forkAtBlock: forkAtBlock('USDC-RGT'),
    actions: ctx => [
        { send: 'swap.swap1Inch', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.USDC.address,
            underlyingOut: ctx.contracts.tokens.RGT.address,
            amount: et.units('50000', 6),
            amountOutMinimum: 0,
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
    ],
})


.run();
