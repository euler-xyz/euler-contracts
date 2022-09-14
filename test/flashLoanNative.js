const et = require('./lib/eTestLib');

et.testSet({
    desc: "flash loans native",

    preActions: ctx => {
        let actions = [];

        actions.push({ from: ctx.wallet, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], });
        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.05', });

        return actions;
    },
})


.test({
    desc: "did not pay back",
    actions: ctx => [
        async () => {
            let errMsg;

            try {
                let tx = await ctx.contracts.flashLoanNativeTest.testFlashLoan({
                    eulerAddr: ctx.contracts.euler.address,
                    marketsAddr: ctx.contracts.markets.address,
                    execAddr: ctx.contracts.exec.address,
                    underlying: ctx.contracts.tokens.TST.address,
                    amount: et.eth(100),
                    payItBack: false,
                });

                await tx.wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('e/collateral-violation');
        },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanNativeTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
    ],
})


.test({
    desc: "does pay back",
    actions: ctx => [
        async () => {
            let tx = await ctx.contracts.flashLoanNativeTest.testFlashLoan({
                eulerAddr: ctx.contracts.euler.address,
                marketsAddr: ctx.contracts.markets.address,
                execAddr: ctx.contracts.exec.address,
                underlying: ctx.contracts.tokens.TST.address,
                amount: et.eth(100),
                payItBack: true,
            });

            await tx.wait();
        },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanNativeTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
    ],
})


.test({
    desc: "simplified, does not pay back",
    actions: ctx => [
        { send: 'flashLoanNativeTest.testFlashLoan2', args: [ctx.contracts.tokens.TST.address, ctx.contracts.dTokens.dTST.address, ctx.contracts.euler.address, et.eth(50), et.eth(50).sub(1), ], expectError: 'e/flash-loan-not-repaid', },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanNativeTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
    ],
})

.test({
    desc: "simplified, more than avail",
    actions: ctx => [
        { send: 'flashLoanNativeTest.testFlashLoan2', args: [ctx.contracts.tokens.TST.address, ctx.contracts.dTokens.dTST.address, ctx.contracts.euler.address, et.eth(500), et.eth(500).sub(1), ], expectError: 'ERC20: transfer amount exceeds balance', },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanNativeTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
    ],
})

.test({
    desc: "simplified, does pay back",
    actions: ctx => [
        { send: 'flashLoanNativeTest.testFlashLoan2', args: [ctx.contracts.tokens.TST.address, ctx.contracts.dTokens.dTST.address, ctx.contracts.euler.address, et.eth(50), et.eth(50), ], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanNativeTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
    ],
})


.run();
