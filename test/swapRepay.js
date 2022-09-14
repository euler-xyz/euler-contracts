const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');

const deposit = (ctx, token, wallet = ctx.wallet, subAccountId = 0, amount = 100, decimals = 18) => [
    { from: wallet, send: `tokens.${token}.mint`, args: [wallet.address, et.units(amount, decimals)], },
    { from: wallet, send: `tokens.${token}.approve`, args: [ctx.contracts.euler.address, et.MaxUint256,], },
    { from: wallet, send: `eTokens.e${token}.deposit`, args: [subAccountId, et.MaxUint256,], },
]


et.testSet({
    desc: 'swap and repay',
    fixture: 'testing-real-uniswap-activated',
    preActions: scenarios.swapUni3(),
})


.test({
    desc: 'repay single - partial repay',
    actions: ctx => [
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(2)] },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100).sub(et.eth(2))  },

        { send: 'swap.swapAndRepayUniSingle', args: [
            {
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                underlyingIn: ctx.contracts.tokens.TST2.address,
                underlyingOut: ctx.contracts.tokens.WETH.address,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                fee: et.DefaultUniswapFee,
                sqrtPriceLimitX96: 0,
            }, 
            et.eth(1)
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.WETH.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(6);
        }},
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100).sub(et.eth(2)).add(et.eth(1)) },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(1), 'TST2/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));

            et.expect(balance).to.equal(et.eth(100).sub(input));
        }},
        // total supply
        { call: 'eTokens.eWETH.totalSupply', equals: [et.eth(100), et.formatUnits(et.DefaultReserve)], },
        { call: 'eTokens.eWETH.totalSupplyUnderlying', equals: [et.eth(100), et.formatUnits(et.DefaultReserve)] },
        // account balances 
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
    ],
})


.test({
    desc: 'repay single - repay full debt',
    actions: ctx => [
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(2)] },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100).sub(et.eth(2))  },

        { send: 'swap.swapAndRepayUniSingle', args: [
            {
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                underlyingIn: ctx.contracts.tokens.TST2.address,
                underlyingOut: ctx.contracts.tokens.WETH.address,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                fee: et.DefaultUniswapFee,
                sqrtPriceLimitX96: 0,
            }, 
            0
        ], },
        // euler underlying balances
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100) },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], onResult: async (balance) => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(2), 'TST2/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));

            et.expect(balance).to.equal(et.eth(100).sub(input));
        }},
        // account balances 
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0) },
    ],
})


.test({
    desc: 'repay single - repay full debt from another subaccount',
    actions: ctx => [
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2', ctx.wallet, 1),
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(2)] },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100).sub(et.eth(2))  },

        { send: 'swap.swapAndRepayUniSingle', args: [
            {
                subAccountIdIn: 1,
                subAccountIdOut: 0,
                underlyingIn: ctx.contracts.tokens.TST2.address,
                underlyingOut: ctx.contracts.tokens.WETH.address,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                fee: et.DefaultUniswapFee,
                sqrtPriceLimitX96: 0,
            }, 
            0
        ], },

        // account balances 
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [et.getSubAccount(ctx.wallet.address, 1)], onResult: async (balance) => {
            let { input } = await ctx.getUniswapInOutAmounts(et.eth(2), 'TST2/WETH', et.eth(100), et.ratioToSqrtPriceX96(1, 1));

            et.equals(balance, et.eth(100).sub(input), 0.01);
        }},
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0) },
    ],
})


.test({
    desc: 'repay single - balance of token-in too low to satisfy target debt',
    actions: ctx => [
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2', ctx.wallet, 0, 1),
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(2)] },

        { send: 'swap.swapAndRepayUniSingle', args: [
            {
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                underlyingIn: ctx.contracts.tokens.TST2.address,
                underlyingOut: ctx.contracts.tokens.WETH.address,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                fee: et.DefaultUniswapFee,
                sqrtPriceLimitX96: 0,
            }, 
            0
        ], expectError: 'STF', },
    ],
})


.test({
    desc: 'repay single - repay more than current debt',
    actions: ctx => [
        { action: 'setIRM', underlying: 'WETH', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'dTokens.dWETH.borrow', args: [0, et.eth(2)] },
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100).sub(et.eth(2))  },

        { send: 'swap.swapAndRepayUniSingle', args: [
            {
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                underlyingIn: ctx.contracts.tokens.TST2.address,
                underlyingOut: ctx.contracts.tokens.WETH.address,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                fee: et.DefaultUniswapFee,
                sqrtPriceLimitX96: 0,
            }, 
            et.eth(3)
        ], expectError: 'e/swap/target-debt', },
    ],
})


.test({
    desc: 'repay single - burn and repay interest in a batch ',
    actions: ctx => [
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        { call: 'tokens.WETH.balanceOf', args: [ctx.contracts.euler.address], assertEql: 0  },
        ...deposit(ctx, 'WETH', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { send: 'eTokens.eWETH.mint', args: [0, et.eth(2)] },

        { action: 'checkpointTime' },
        { action: 'jumpTimeAndMine', time: 10 * 86400},

        // interest accrued
        { call: 'eTokens.eWETH.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.gt(et.eth(2)));
            ctx.stash.e = r;
        } },
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], onResult: r => {
            et.assert(r.gt(et.eth(2)));
            et.assert(r.gt(ctx.stash.e))
        } },

        { action: 'sendBatch', deferLiquidityChecks: [], batch: [
            { send: 'eTokens.eWETH.burn', args: [0, et.MaxUint256], },
            { send: 'swap.swapAndRepayUniSingle', args: [
                {
                    subAccountIdIn: 0,
                    subAccountIdOut: 0,
                    underlyingIn: ctx.contracts.tokens.TST2.address,
                    underlyingOut: ctx.contracts.tokens.WETH.address,
                    amountOut: 0,
                    amountInMaximum: et.MaxUint256,
                    deadline: 0,
                    fee: et.DefaultUniswapFee,
                    sqrtPriceLimitX96: 0,
                }, 
                0
            ], },
        ], },

        // account balances 
        { call: 'dTokens.dWETH.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0) },
    ],
})


.test({
    desc: 'repay multi-hop - partial repay',
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'TST3', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(2)] },

        { send: 'swap.swapAndRepayUni', args: [
            async () => ({
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                path: await ctx.encodeUniswapPath(['TST/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST', 'TST3', true),
            }),
            et.eth(1)
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.euler.address);
            et.expect(logs.length).to.equal(5);
            et.expect(logs[0].name).to.equal('RequestSwap');
            et.expect(logs[0].args.accountIn.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.accountOut.toLowerCase()).to.equal(et.getSubAccount(ctx.wallet.address, 0));
            et.expect(logs[0].args.underlyingIn).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.underlyingOut).to.equal(ctx.contracts.tokens.TST3.address);
            et.expect(logs[0].args.amount).to.equal(et.eth(1));
            et.expect(logs[0].args.swapType).to.equal(7);
        }},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('98.959640948996359994')},
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(99)},

        // account balances 
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth('98.959640948996359994'), 0.01] },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1) },
    ],
})


.test({
    desc: 'repay multi-hop - full repay',
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST'),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'TST3', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(2)] },

        { send: 'swap.swapAndRepayUni', args: [
            async () => ({
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                path: await ctx.encodeUniswapPath(['TST/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST', 'TST3', true),
            }),
            0
        ]},
        // euler underlying balances
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('97.852663175563921367')},
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100)},

        // account balances 
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth('97.852663175563921367'), 0.01] },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})

.test({
    desc: 'repay multi-hop - full repay, 6 decimal token in',
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST3', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST4', ctx.wallet, 0, 100, 6),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'TST3', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'dTokens.dTST3.borrow', args: [0, et.eth(2)] },

        { send: 'swap.swapAndRepayUni', args: [
            async () => ({
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                path: await ctx.encodeUniswapPath(['TST4/WETH', 'TST2/WETH', 'TST2/TST3'], 'TST4', 'TST3', true),
            }),
            0
        ]},
        // euler underlying balances
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units('97.897671', 6)},
        { call: 'tokens.TST3.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100)},

        // account balances
        { call: 'eTokens.eTST4.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.units('97.897671', 6), '0.000001'] },
        { call: 'dTokens.dTST3.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})

.test({
    desc: 'repay multi-hop - full repay, 6 decimal token out',
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST4', irm: 'IRM_ZERO', },
        ...deposit(ctx, 'TST4', ctx.wallet, 0, 100, 6),
        ...deposit(ctx, 'TST2'),
        ...deposit(ctx, 'TST3', ctx.wallet3),
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { send: 'dTokens.dTST4.borrow', args: [0, et.units(2, 6)] },

        { send: 'swap.swapAndRepayUni', args: [
            async () => ({
                subAccountIdIn: 0,
                subAccountIdOut: 0,
                amountOut: 0,
                amountInMaximum: et.MaxUint256,
                deadline: 0,
                path: await ctx.encodeUniswapPath(['TST2/WETH', 'TST4/WETH'], 'TST2', 'TST4', true),
            }),
            0
        ]},
        // euler underlying balances
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth('97.94675732333250076'), },
        { call: 'tokens.TST4.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.units(100, 6), },

        // account balances
        { call: 'eTokens.eTST2.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth('97.94675732333250076'), 0.01] },
        { call: 'dTokens.dTST4.balanceOf', args: [ctx.wallet.address], assertEql: 0 },
    ],
})

.run();
