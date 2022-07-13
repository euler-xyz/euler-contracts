const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');

const permitDomain = (symbol, ctx) => ({
    name: `Test Token ${symbol.slice(3)}`,
    version: '1',
    chainId: 1,
    verifyingContract: ctx.contracts.tokens[symbol].address,
});

et.testSet({
    desc: 'permit',
    preActions: ctx => [
        ...scenarios.basicLiquidity()(ctx),
        { send: 'tokens.TST3.mint', args: [ctx.wallet.address, et.eth(100)], },
    ],
})


.test({
    desc: 'EIP2612 standard',
    actions: ctx => [
        {
            action: 'signPermit',
            token: 'TST3',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'EIP2612',
            domain: permitDomain('TST3', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },

        { action: 'sendBatch', batch: [
            { send: 'exec.usePermit', args: [
                ctx.contracts.tokens.TST3.address,
                et.eth(10),
                et.MaxUint256,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        ], },
        // First user loses a small amount to the default reserves
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'EIP2612 standard, market not activated',
    actions: ctx => [
        {
            action: 'signPermit',
            token: 'TST4',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'EIP2612',
            domain: permitDomain('TST4', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermit', args: [
            ctx.contracts.tokens.TST4.address,
            et.eth(10),
            et.MaxUint256,
            () => ctx.stash.permit.signature.v,
            () => ctx.stash.permit.signature.r,
            () => ctx.stash.permit.signature.s
        ], expectError: 'e/exec/market-not-activated'},
    ],
})


.test({
    desc: 'packed type',
    actions: ctx => [
        {
            action: 'signPermit',
            token: 'TST3',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'Packed',
            domain: permitDomain('TST3', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },

        { action: 'sendBatch', batch: [
            { send: 'exec.usePermitPacked', args: [
                ctx.contracts.tokens.TST3.address,
                et.eth(10),
                et.MaxUint256,
                () => ctx.stash.permit.rawSignature,
            ], },
            { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        ], },
        // First user loses a small amount to the default reserves
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
    ],
})


.test({
    desc: 'packed type, market not activated',
    actions: ctx => [
        {
            action: 'signPermit',
            token: 'TST4',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'Packed',
            domain: permitDomain('TST4', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermitPacked', args: [
            ctx.contracts.tokens.TST4.address,
            et.eth(10),
            et.MaxUint256,
            () => ctx.stash.permit.rawSignature,
        ], expectError: 'e/exec/market-not-activated'},
    ],
})


.test({
    desc: 'allowed type',
    actions: ctx => [
        { send: 'tokens.TST3.configure', args: ['permit/allowed', []], },
        {
            action: 'signPermit',
            token: 'TST3',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'Allowed',
            domain: permitDomain('TST3', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: 0, },
        { action: 'sendBatch', batch: [
            { send: 'exec.usePermitAllowed', args: [
                ctx.contracts.tokens.TST3.address,
                () => ctx.stash.permit.nonce,
                et.MaxUint256,
                true,
                () => ctx.stash.permit.signature.v,
                () => ctx.stash.permit.signature.r,
                () => ctx.stash.permit.signature.s
            ], },
            { send: 'eTokens.eTST3.deposit', args: [0, et.eth(10)], },
        ], },
        // First user loses a small amount to the default reserves
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(10), et.formatUnits(et.DefaultReserve)], },
        { call: 'tokens.TST3.allowance', args: [ctx.wallet.address, ctx.contracts.euler.address], assertEql: et.MaxUint256, },
    ],
})


.test({
    desc: 'allowed type, market not activated',
    actions: ctx => [
        {
            action: 'signPermit',
            token: 'TST4',
            signer: ctx.wallet,
            spender: ctx.contracts.euler.address,
            value: et.eth(10),
            deadline: et.MaxUint256,
            permitType: 'Allowed',
            domain: permitDomain('TST4', ctx),
            onResult: r => {
                ctx.stash.permit = r;
            },
        },
        { send: 'exec.usePermitAllowed', args: [
            ctx.contracts.tokens.TST4.address,
            () => ctx.stash.permit.nonce,
            et.MaxUint256,
            true,
            () => ctx.stash.permit.signature.v,
            () => ctx.stash.permit.signature.r,
            () => ctx.stash.permit.signature.s
        ], expectError: 'e/exec/market-not-activated'},
    ],
})


.run();
