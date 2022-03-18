const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');

const deposit = (ctx, token, wallet = ctx.wallet, subAccountId = 0, amount = 100, decimals = 18) => [
    { from: wallet, send: `tokens.${token}.mint`, args: [wallet.address, et.units(amount, decimals)], },
    { from: wallet, send: `tokens.${token}.approve`, args: [ctx.contracts.euler.address, et.MaxUint256,], },
    { from: wallet, send: `eTokens.e${token}.deposit`, args: [subAccountId, et.MaxUint256,], },
]

const setupInterestRates = ctx => [
    { action: 'setIRM', underlying: 'TST', irm: 'IRM_LINEAR', },
    { action: 'setIRM', underlying: 'WETH', irm: 'IRM_LINEAR', },
    { action: 'setIRM', underlying: 'TST3', irm: 'IRM_LINEAR', },
    { action: 'setIRM', underlying: 'TST4', irm: 'IRM_LINEAR', },

    ...deposit(ctx, 'TST'),
    ...deposit(ctx, 'TST4', ctx.wallet, 0, 100, 6),
    ...deposit(ctx, 'WETH'),
    ...deposit(ctx, 'TST3', ctx.wallet2, 0, 200),

    { action: 'checkpointTime' },

    { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST3.address], },
    { from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST4.address], },

    { action: 'jumpTime', time: 5, },
    { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(9)], },
    { action: 'jumpTime', time: 1, },
    { from: ctx.wallet2, send: 'dTokens.dTST4.borrow', args: [0, et.units(9, 6)], },
    { action: 'jumpTime', time: 1, },
    { from: ctx.wallet2, send: 'dTokens.dWETH.borrow', args: [0, et.eth(9)], },
    
    { action: 'jumpTime', time: 31*60 + 1, },
    { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
    { action: 'jumpTime', time: 5, },
    { from: ctx.wallet2, send: 'dTokens.dTST4.borrow', args: [0, et.units(1, 6)], },
    { action: 'jumpTime', time: 5, },
    { from: ctx.wallet2, send: 'dTokens.dWETH.borrow', args: [0, et.eth(1)], },

    { action: 'checkpointTime' },
]

const basicExactInputSingleParams = ctx => ({
    subAccountIdIn: 0,
    subAccountIdOut: 0,
    underlyingIn: ctx.contracts.tokens.TST.address,
    underlyingOut: ctx.contracts.tokens.WETH.address,
    amountIn: et.eth(1),
    amountOutMinimum: 0,
    deadline: 0,
    fee: et.DefaultUniswapFee,
    sqrtPriceLimitX96: 0
})

et.testSet({
    desc: 'swap - uni3',
    fixture: 'testing-real-uniswap-activated',
    preActions: scenarios.swapUni3(),
})


.test({
    desc: 'uni exact input single - basic',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0 },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100) },
        { send: 'swap.swapUniExactInputSingle', args: [basicExactInputSingleParams(ctx)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.WETH.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(1);
        }},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(99) },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));
            et.expect(balance).to.equal(output);
            ctx.stash.expectedOut = balance;
        }, },
        // total supply
        { call: 'eTokens.eTST.totalSupply', assertEql: et.eth(99) },
        { call: 'eTokens.eTST.totalSupplyUnderlying', assertEql: et.eth(99) },
        { call: 'eTokens.eWETH.totalSupply', assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eWETH.totalSupplyUnderlying', assertEql: () => ctx.stash.expectedOut },
        // account balances 
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - inverted',
    actions: ctx => [
        ...deposit(ctx, 'WETH'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            underlyingIn: ctx.contracts.tokens.WETH.address,
            underlyingOut: ctx.contracts.tokens.TST.address,
        }] },
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(99) },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));
            et.expect(balance).to.equal(output);
            ctx.stash.expectedOut = balance;
        }},
        // account balances 
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(99) },
    ],
})


.test({
    desc: 'uni exact input single - max uint amount in',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0 },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100) },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.MaxUint256,
        }] },
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0 },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(et.eth(100), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));
            et.expect(balance).to.equal(output);
            ctx.stash.expectedOut = balance;
        }},
        // account balances 
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - outgoing decimals under 18',
    actions: ctx => [
        ...deposit(ctx, 'TST4', ctx.wallet, 0, 100, 6),
        { send: 'swap.swapUniExactInputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST4.address,
            underlyingOut: ctx.contracts.tokens.TST.address,
            amountIn: et.units(1, 6),
            amountOutMinimum: 0,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        }] },
        // euler underlying balances
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(99, 6) },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(et.units(1, 6), 'TST4/TST', et.eth(100), et.ratioToSqrtPriceX96(1e12, 1));
            // uni pool mint creates slightly different pool token balances when tokens are not inverted and init ratio is (1e12, 1) 
            // vs when tokens are inverted and ratio is (1, 1e12). This results in slightly different actual swap result vs calculated by sdk 
            et.equals(balance, output, '.000000000000001')
            ctx.stash.expectedOut = balance;
        }},
        // account balances 
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eTST4.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.units(99, 6) },
    ],
})


.test({
    desc: 'uni exact input single - incoming decimals under 18',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { action: 'cb', cb: async () => {
            let { output } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/TST4', et.eth(100), et.ratioToSqrtPriceX96(1, 1e12));
            ctx.stash.expectedOut = output;
        }},
        { send: 'swap.swapUniExactInputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.TST4.address,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        }], onLogs: logs => {
            et.expect(logs.length).to.equal(5);
            et.expect(logs[4].name).to.equal("AssetStatus");
            et.expect(logs[4].args.underlying).to.equal(ctx.contracts.tokens.TST4.address);
            et.expect(logs[4].args.totalBalances).to.equal(et.eth(et.formatUnits(ctx.stash.expectedOut, 6)));
            et.expect(logs[4].args.poolSize).to.equal(et.eth(et.formatUnits(ctx.stash.expectedOut, 6)));
        }},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(99) },
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], assertEql: () => ctx.stash.expectedOut, },
        // account balances 
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eTST4.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut.mul(et.units(1, 12)) },
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedOut },
    ],
})


.test({
    desc: 'uni exact input single - between subaccounts',
    actions: ctx => [
        ...deposit(ctx, 'TST', ctx.wallet, 1),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            subAccountIdIn: 1,
            subAccountIdOut: 2,
        }] },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));
            et.expect(balance).to.equal(output);
            ctx.stash.expectedOut = balance;
        }},
        { call: 'eTokens.eWETH.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], assertEql: () => ctx.stash.expectedOut },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 2)], assertEql: () => ctx.stash.expectedOut },
        { call: 'dTokens.dWETH.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 2)], assertEql: 0 },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(99) },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: et.eth(99) },
        { call: 'dTokens.dTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - interest rate updated',
    actions: ctx => [
        ...setupInterestRates(ctx),

        { action: 'jumpTime', time: 1, },
        { send: 'swap.swapUniExactInputSingle', args: [basicExactInputSingleParams(ctx)], },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth('10.000004816784613841'), },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('10.000004816784613841', '89'), },

        { call: 'dTokens.dWETH.totalSupply', args: [], assertEql: et.eth('10.000004805630159981'), },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('90.987158034397061298'), },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.WETH.address], assertEql: et.linearIRM('10.000004805630159981', '90.987158034397061298'), },
    ],
})


.test({
    desc: 'uni exact input single - max uint amount in with interest',
    actions: ctx => [
        ...setupInterestRates(ctx),
         { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST', ctx.wallet2),
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerTSTBalance = r;
        } },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerWETHBalance = r;
        } },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountTSTBalance = r;
        } },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountWETHBalance = r;
        } },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.MaxUint256,
        }] },
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            et.assert(r.eq(ctx.stash.eulerTSTBalance.sub(ctx.stash.accountTSTBalance)));
        } },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(ctx.stash.accountTSTBalance, 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));
            et.expect(balance).to.equal(ctx.stash.eulerWETHBalance.add(output));
            ctx.stash.expectedOut = output;
        }},
        // account balances 
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            et.equals(r, ctx.stash.accountWETHBalance.add(ctx.stash.expectedOut), '0.00000000000000001'); // deposit rounded down
        }, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - max uint amount in with interest, outgoing decimals under 18',
    actions: ctx => [
        ...setupInterestRates(ctx),
        { action: 'setIRM', underlying: 'TST4', irm: 'IRM_ZERO', },
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST4', ctx.wallet2),
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerTST4Balance = r;
        } },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerWETHBalance = r;
        } },
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountTST4Balance = r;
        } },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountWETHBalance = r;
        } },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            underlyingIn: ctx.contracts.tokens.TST4.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountIn: et.MaxUint256,
        }] },
        // euler underlying balances
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            et.assert(r.eq(ctx.stash.eulerTST4Balance.sub(ctx.stash.accountTST4Balance)));
        } },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(ctx.stash.accountTST4Balance, 'TST4/WETH', et.eth(100), et.ratioToSqrtPriceX96(1e12, 1));
            et.equals(balance, ctx.stash.eulerWETHBalance.add(output), '0.00000000000001'); // price is not exactly 1 after mint
            ctx.stash.expectedOut = output;
        }},
        // account balances 
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            et.equals(r, ctx.stash.accountWETHBalance.add(ctx.stash.expectedOut), '0.00000000000001');
        }, },
        { call: 'eTokens.eTST4.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - max uint amount in with interest, incoming decimals under 18',
    actions: ctx => [
        ...setupInterestRates(ctx),
        { action: 'setIRM', underlying: 'TST4', irm: 'IRM_ZERO', },
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'WETH', ctx.wallet2),
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerTST4Balance = r;
        } },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            ctx.stash.eulerWETHBalance = r;
        } },
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountTST4Balance = r;
        } },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            ctx.stash.accountWETHBalance = r;
        } },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            underlyingIn: ctx.contracts.tokens.WETH.address,
            underlyingOut: ctx.contracts.tokens.TST4.address,
            amountIn: et.MaxUint256,
        }] },
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], onResult: r => {
            et.assert(r.eq(ctx.stash.eulerWETHBalance.sub(ctx.stash.accountWETHBalance)));
        } },
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { output } = await ctx.getUniswapInOutAmounts(ctx.stash.accountWETHBalance, 'TST4/WETH', et.eth(100), et.ratioToSqrtPriceX96(1e12, 1), true);

            et.equals(balance, ctx.stash.eulerTST4Balance.add(output), '0.00000000000001'); // price is not exactly 1 after mint
            ctx.stash.expectedOut = output;
        }},
        // account balances 
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            et.equals(r, ctx.stash.accountTST4Balance.add(ctx.stash.expectedOut));
        }, },
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact input single - deadline set',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { action: 'checkpointTime' },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            deadline: ctx.lastCheckpointTime + 1000,
        }], },
    ],
})


.test({
    desc: 'uni exact input single - before deadline',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            deadline: 1,
        }], expectError: 'Transaction too old' },
    ],
})


.test({
    desc: 'uni exact input single - min amount out not reached',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountOutMinimum: et.eth(2),
        }], expectError: 'Too little received' },
    ],
})


.test({
    desc: 'uni exact input single - above price limit',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            sqrtPriceLimitX96: ctx.poolAdjustedRatioToSqrtPriceX96('TST/WETH', 2, 1),
        }], expectError: 'SPL' },
    ],
})


.test({
    desc: 'uni exact input single - insufficient pool size',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.eth(101),
        }], expectError: 'e/swap/insufficient-pool-size' },
    ],
})


.test({
    desc: 'uni exact input single - insufficient balance',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST', ctx.wallet2),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.eth(101),
        }], expectError: 'e/insufficient-balance' },
    ],
})


.test({
    desc: 'uni exact input single - market not activated - in',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            underlyingIn: ctx.contracts.tokens.UTST.address,
        }], expectError: 'e/swap/in-market-not-activated' },
    ],
})


.test({
    desc: 'uni exact input single - market not activated - out',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            underlyingOut: ctx.contracts.tokens.UTST.address,
        }], expectError: 'e/swap/out-market-not-activated' },
    ],
})


.test({
    desc: 'uni exact input single - deflationary token in',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'tokens.TST.configure', args: ['transfer/deflationary', et.abiEncode(['uint256'], [et.eth(1)])], },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
        }], expectError: 'IIA' },
    ],
})


.test({
    desc: 'uni exact input single - collateral violation',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2', ctx.wallet2),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address] },
        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(20)] },

        // liquidity check should fail
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.eth(50),
        }], expectError: 'e/collateral-violation' },

        // unless the incoming token counts as collateral as well
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.WETH.address] },
        { send: 'swap.swapUniExactInputSingle', args: [{
            ...basicExactInputSingleParams(ctx),
            amountIn: et.eth(50),
        }] },
    ],
})


.test({
    desc: 'uni exact input single - leverage in a batch',
    actions: ctx => [
        ...deposit(ctx, 'TST', ctx.wallet, 0, 1),
        ...deposit(ctx, 'TST', ctx.wallet2, 0, 1000),
        ...deposit(ctx, 'WETH', ctx.wallet2, 0, 1000),
        { action: 'setAssetConfig', tok: 'WETH', config: { borrowFactor: 1}, },

        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address] },
        { action: 'sendBatch', deferLiquidityChecks: [ctx.wallet.address], batch: [
            { send: 'eTokens.eWETH.mint', args: [0, et.eth(2.5)] },
            { send: 'swap.swapUniExactInputSingle', args: [{
                ...basicExactInputSingleParams(ctx),
                underlyingIn: ctx.contracts.tokens.WETH.address,
                underlyingOut: ctx.contracts.tokens.TST.address,
                amountIn: et.eth(2.5)
            }]}, 
        ]}, 
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth('3.431885259897065638') },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(2.5) },
    ],
})

.test({
    desc: 'uni exact input multi-hop - basic',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            path: await ctx.encodeUniswapPath(['TST/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST', 'TST3'),
        })], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.TST3.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(2);
        }},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(99) },
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('0.962329947778299007')},
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0},
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0},
        // account balances 
        { call: 'eTokens.eTST3.balanceOf', args: [ctx.wallet.address], assertEql: et.eth('0.962329947778299007') },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth('0.962329947778299007') },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0 },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(99) },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },

        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})



.test({
    desc: 'uni exact input multi-hop - out token same as in token',
    actions: ctx => [
        ...deposit(ctx, 'TST2'),
        { send: 'swap.swapUniExactInput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            path: await ctx.encodeUniswapPath(['TST2/WETH', 'TST3/WETH', 'TST2/TST3'], 'TST2', 'TST2'),
        })], expectError: 'e/swap/same' },
    ],
})


.test({
    desc: 'uni exact input multi-hop - path too short',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            path: et.encodePacked(['address', 'uint24'], [ctx.contracts.tokens.TST.address, et.DefaultUniswapFee]),
        })], expectError: 'e/swap/uni-path-length' },
    ],
})


.test({
    desc: 'uni exact input multi-hop - path invalid format',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            path: et.encodePacked(['address', 'uint24', 'address', 'uint24'], [
                ctx.contracts.tokens.TST.address,
                et.DefaultUniswapFee,
                ctx.contracts.tokens.TST2.address,
                et.DefaultUniswapFee,
            ]),
        })], expectError: 'e/swap/uni-path-format' },
    ],
})


.test({
    desc: 'uni exact input multi-hop - empty path',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactInput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountIn: et.eth(1),
            amountOutMinimum: 0,
            deadline: 0,
            path: [],
        })], expectError: 'e/swap/uni-path-length' },
    ],
})


.test({
    desc: 'uni exact output single - basic',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountOut: et.eth(1),
            amountInMaximum: et.MaxUint256,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0,
        }], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.WETH.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(3);
        }},
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1) },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));

            et.expect(balance).to.equal(et.eth(100).sub(input));
            ctx.stash.expectedIn = balance;
        }},
        // total supply
        { call: 'eTokens.eTST.totalSupply', assertEql: () => ctx.stash.expectedIn },
        { call: 'eTokens.eTST.totalSupplyUnderlying', assertEql: () => ctx.stash.expectedIn },
        { call: 'eTokens.eWETH.totalSupply', assertEql: et.eth(1) },
        { call: 'eTokens.eWETH.totalSupplyUnderlying', assertEql: et.eth(1) },
        // account balances 
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact output single - interest rate updated',
    actions: ctx => [
        ...setupInterestRates(ctx),

        { action: 'jumpTime', time: 1, },
        { send: 'swap.swapUniExactOutputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountOut: et.eth(1),
            amountInMaximum: et.MaxUint256,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        }], },

        { call: 'dTokens.dTST.totalSupply', args: [], assertEql: et.eth('10.000004816784613841'), },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('88.986859568604804310'), },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.TST.address], assertEql: et.linearIRM('10.000004816784613841', '88.986859568604804310'), },

        { call: 'dTokens.dWETH.totalSupply', args: [], assertEql: et.eth('10.000004805630159981'), },
        { call: 'markets.interestRate', args: [ctx.contracts.tokens.WETH.address], assertEql: et.linearIRM('10.000004805630159981', '91'), },
    ],
})


.test({
    desc: 'uni exact output single - max amount in not sufficient',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountOut: et.eth(1),
            amountInMaximum: et.eth(1),
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        }], expectError: 'STF' },
    ],
})


.test({
    desc: 'uni exact output single - remaining allowance removed',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutputSingle', args: [{
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountOut: et.eth(1),
            amountInMaximum: et.MaxUint256,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        }] },
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1) },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));

            et.expect(balance).to.equal(et.eth(100).sub(input));
            ctx.stash.expectedIn = balance;
        }},
        // account balances 
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1) },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },

        { call: 'tokens.TST.allowance', args: [ctx.contracts.euler.address, ctx.contracts.swapRouter.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact output single - exact amount in max',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        async () => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1))
            ctx.stash.amountInMax = input;
        },
        { send: 'swap.swapUniExactOutputSingle', args: [() => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            underlyingIn: ctx.contracts.tokens.TST.address,
            underlyingOut: ctx.contracts.tokens.WETH.address,
            amountOut: et.eth(1),
            amountInMaximum: ctx.stash.amountInMax,
            deadline: 0,
            fee: et.DefaultUniswapFee,
            sqrtPriceLimitX96: 0
        })] },
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1) },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            et.expect(balance).to.equal(et.eth(100).sub(ctx.stash.amountInMax));
            ctx.stash.expectedIn = balance;
        }},
        // account balances 
        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1) },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: () => ctx.stash.expectedIn },

        { call: 'tokens.TST.allowance', args: [ctx.contracts.euler.address, ctx.contracts.swapRouter.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact output multi-hop - basic',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountOut: et.eth(1),
            amountInMaximum: et.MaxUint256,
            deadline: 0,
            path: await ctx.encodeUniswapPath(['TST/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST', 'TST3', true),
        })], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.TST3.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(4);
        }},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('98.959640948996359994') },
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1)},
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0},
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0},
        // account balances 
        { call: 'eTokens.eTST3.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'eTokens.eTST3.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth(1) },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0 },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth('98.959640948996359994') },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: et.eth('98.959640948996359994') },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        
        { call: 'eTokens.eTST2.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },

        { call: 'eTokens.eWETH.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0 },
    ],
})


.test({
    desc: 'uni exact output multi-hop - exact amount in max',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountOut: et.eth(1),
            amountInMaximum: et.eth(100).sub(et.eth('98.959640948996359994')),
            deadline: 0,
            path: await ctx.encodeUniswapPath(['TST/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST', 'TST3', true),
        })]},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('98.959640948996359994') },
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(1)},
    ],
})


.test({
    desc: 'uni exact input multi-hop - path too short',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        { send: 'swap.swapUniExactOutput', args: [async () => ({
            subAccountIdIn: 0,
            subAccountIdOut: 0,
            amountOut: et.eth(1),
            amountInMaximum: et.MaxUint256,
            deadline: 0,
            path: et.encodePacked(['address', 'uint24'], [ctx.contracts.tokens.TST.address, et.DefaultUniswapFee]),
        })], expectError: 'e/swap/uni-path-length' },
    ],
})


.run();
