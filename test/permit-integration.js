const et = require('./lib/eTestLib');

et.testSet({
    desc: 'permit on mainnet fork',
    fixture: 'mainnet-fork',
    timeout: 200_000,
    forkAtBlock: 14200000,
    preActions: ctx => [
        { action: 'setAssetConfig', tok: 'USDC', config: { collateralFactor: .4}, },
        { send: 'markets.activatePToken', args: [ctx.contracts.tokens.USDC.address], },
        { action: 'cb', cb: async () => {
            ctx.contracts.pTokens = {};
            let pTokenAddr = await ctx.contracts.markets.underlyingToPToken(ctx.contracts.tokens.USDC.address);
            ctx.contracts.pTokens['pUSDC'] = await ethers.getContractAt('PToken', pTokenAddr);
        }},
    ]
})


.test({
    desc: 'EIP2612 standard permit - USDC',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'USDC', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.units(10, 6), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.USDC.address,
                et.units(10, 6),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eUSDC.deposit', args: [0, et.units(10, 6)], },
        ], },
        { call: 'eTokens.eUSDC.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units(10, 6), '0.000000000001'] },
        { call: 'tokens.USDC.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'Use permit in pToken wrap',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.pTokens.pUSDC.address], },

        { action: 'signPermit', token: 'USDC', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.units(10, 6), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermit', args: [
            ctx.contracts.tokens.USDC.address,
            et.units(10, 6),
            et.MaxUint256,
            () => ctx.stash.permit.signature.v,
            () => ctx.stash.permit.signature.r,
            () => ctx.stash.permit.signature.s
        ], },
        { send: 'exec.pTokenWrap', args: [ctx.contracts.tokens.USDC.address, et.units(10, 6)], },

        { call: 'pTokens.pUSDC.balanceOf', args: [ctx.wallet.address], assertEql: et.units(10, 6), },
        { call: 'tokens.USDC.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'EIP2612 permit with salt - GRT',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'GRT', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'GRT', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.eth(10), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.GRT.address,
                et.eth(10),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eGRT.deposit', args: [0, et.eth(10)], },
        ], },
        { call: 'eTokens.eGRT.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), '0.000000000001'], },
        { call: 'tokens.GRT.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'Allowed type permit - DAI',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'DAI', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'DAI', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: true, deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermitAllowed', args: [
                ctx.contracts.tokens.DAI.address,
                () => ctx.stash.permit.nonce,
                et.MaxUint256,
                true,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eDAI.deposit', args: [0, et.eth(10)], },
        ], },
        { call: 'eTokens.eDAI.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), '0.000000000001'], },

        // remove allowance
        { action: 'signPermit', token: 'DAI', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: false, deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermitAllowed', args: [
            ctx.contracts.tokens.DAI.address,
            () => ctx.stash.permit.nonce,
            et.MaxUint256,
            false,
            () => ctx.stash.permit.signature.v,
            () => ctx.stash.permit.signature.r,
            () => ctx.stash.permit.signature.s
        ], },
        { call: 'tokens.DAI.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'Packed type permit - YVBOOST',
    actions: ctx => [
        { action: 'signPermit', token: 'YVBOOST', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.eth(10), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermitPacked', args: [
            ctx.contracts.tokens.YVBOOST.address,
            et.eth(10),
            et.MaxUint256,
            () => ctx.stash.permit.rawSignature,
        ], },
        { call: 'tokens.YVBOOST.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: et.eth(10), },
    ],
})


.test({
    desc: 'Incorrect signer',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'USDC', signer: ctx.wallet2, spender: ctx.contracts.euler.address, value: et.units(10, 6), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.USDC.address,
                et.units(10, 6),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eUSDC.deposit', args: [0, et.units(10, 6)], },
        ], expectError: 'EIP2612: invalid signature'},
    ],
})


.test({
    desc: 'Incorrect spender',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'USDC', signer: ctx.wallet, spender: ctx.contracts.exec.address, value: et.units(10, 6), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.USDC.address,
                et.units(10, 6),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eUSDC.deposit', args: [0, et.units(10, 6)], },
        ], expectError: 'EIP2612: invalid signature'},
    ],
})


.test({
    desc: 'Past deadline',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'USDC', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.units(10, 6), deadline: 1,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.USDC.address,
                et.units(10, 6),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eUSDC.deposit', args: [0, et.units(10, 6)], },
        ], expectError: 'EIP2612: invalid signature'},
    ],
})


.test({
    desc: 'Permit value too low',
    actions: ctx => [
        { action: 'setTokenBalanceInStorage', token: 'USDC', for: ctx.wallet.address, amount: 100_000 },
        { action: 'signPermit', token: 'USDC', signer: ctx.wallet, spender: ctx.contracts.euler.address, value: et.units(5, 6), deadline: et.MaxUint256,
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.USDC.address,
                et.units(10, 6),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eUSDC.deposit', args: [0, et.units(10, 6)], },
        ], expectError: 'EIP2612: invalid signature'},
    ],
})


.run();
