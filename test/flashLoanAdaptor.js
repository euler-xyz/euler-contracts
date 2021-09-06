const et = require('./lib/eTestLib');

et.testSet({
    desc: "flash loans adaptor",

    preActions: ctx => {
        let actions = [];

        actions.push({ from: ctx.wallet, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(100)], });
        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });
        actions.push({ from: ctx.wallet, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], });
        actions.push({ from: ctx.wallet, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.05', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        return actions;
    },
})


.test({
    desc: "max flash loan supported token",
    actions: ctx => [
        { call: 'flashLoan.maxFlashLoan', args: [ctx.contracts.tokens.TST.address], assertEql: et.eth(100), },   
    ],
})


.test({
    desc: "max flash loan unsupported token",
    actions: ctx => [
        { call: 'flashLoan.maxFlashLoan', args: [et.AddressZero], assertEql: 0, },   
    ],
})


.test({
    desc: "flash fee supported token",
    actions: ctx => [
        { call: 'flashLoan.flashFee', args: [ctx.contracts.tokens.TST.address, et.eth(1)], assertEql: 0, },   
    ],
})


.test({
    desc: "flash fee unsupported token",
    actions: ctx => [
        { call: 'flashLoan.flashFee', args: [et.AddressZero, et.eth(1)], expectError: 'e/flash-loan/unsupported-token', },  
    ],
})


.test({
    desc: "borrow more than pool size",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST.address],
            [et.eth(101)],
        ], expectError: 'e/insufficient-tokens-available' },
    ],
})


.test({
    desc: "borrow unsupported token",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST4.address],
            [et.eth(1)],
        ], expectError: 'e/flash-loan/unsupported-token' },
    ],
})


.test({
    desc: "approve reverts",
    actions: ctx => [
        { send: 'flashLoanAdaptorTest.setMaxAllowance', args: [ctx.contracts.tokens.TST.address, ctx.contracts.flashLoan.address], },
        { send: 'tokens.TST.configure', args: ['approve/revert', []], },  
        { from: ctx.wallet, send: 'flashLoan.flashLoan', args: [
            ctx.contracts.flashLoanAdaptorTest.address,
            ctx.contracts.tokens.TST.address,
            et.eth(50),
            et.abiEncode(['address[]', 'address[]', 'uint256[]', 'uint256'], [[], [], [], 0]),
        ], expectError: 'e/flash-loan/approve' },
    ],
})


.test({
    desc: "callback caller",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoan.onDeferredLiquidityCheck', args: [[]], expectError: 'e/flash-loan/on-deferred-caller' },
    ],
})


.test({
    desc: "borrow through borrower contract",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST.address],
            [et.eth(50)],
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('BorrowResult');

            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(et.eth(0));
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);
        }},
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
        
        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], }, 
    ],
})


.test({
    desc: "borrow through borrower contract, approve returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['approve/return-void', []], },  
        { send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST.address],
            [et.eth(50)],
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('BorrowResult');

            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(et.eth(0));
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);
        }},
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
        
        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], }, 
    ],
})


.test({
    desc: "borrow through borrower contract reenter",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            Array(2).fill(ctx.contracts.flashLoanAdaptorTest.address),
            Array(2).fill(ctx.contracts.tokens.TST.address),
            Array(2).fill(et.eth(50)),
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs.length).to.equal(2);
            et.expect(logs[0].name).to.equal('BorrowResult');

            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(et.eth(0));
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);

            et.expect(logs[1].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[1].args.balance).to.equal(et.eth(100));
            et.expect(logs[1].args.fee).to.equal(et.eth(0));
            et.expect(logs[1].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[1].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[1].args.borrowIndex).to.equal(1);
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], },  
    ],
})


.test({
    desc: "borrow through borrower contract reenter multiple tokens",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address, ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address],
            [et.eth(50), et.eth(50)],
        ], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs.length).to.equal(2);
            et.expect(logs[0].name).to.equal('BorrowResult');

            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(et.eth(0));
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);

            et.expect(logs[1].args.token).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[1].args.balance).to.equal(et.eth(50));
            et.expect(logs[1].args.fee).to.equal(et.eth(0));
            et.expect(logs[1].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[1].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[1].args.borrowIndex).to.equal(1);
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], },   
    ],
})


.test({
    desc: "borrow through borrower contract reenter multiple tokens multiple receivers",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            [ctx.contracts.flashLoanAdaptorTest.address, ctx.contracts.flashLoanAdaptorTest2.address, ctx.contracts.flashLoanAdaptorTest.address],
            [ctx.contracts.tokens.TST.address, ctx.contracts.tokens.TST2.address, ctx.contracts.tokens.TST.address],
            [et.eth(50), et.eth(50), et.eth(50)],
        ], onRawLogs: rawLogs => {

            let logs = rawLogs.filter(l => [ctx.contracts.flashLoanAdaptorTest.address, ctx.contracts.flashLoanAdaptorTest2.address].includes(l.address))
                .map(l => ({address: l.address, ...ctx.contracts.flashLoanAdaptorTest.interface.parseLog(l)}));

            et.expect(logs.length).to.equal(3);
            et.expect(logs[0].name).to.equal('BorrowResult');
            et.expect(logs[0].address).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(et.eth(0));
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);

            et.expect(logs[1].name).to.equal('BorrowResult');
            et.expect(logs[1].address).to.equal(ctx.contracts.flashLoanAdaptorTest2.address);
            et.expect(logs[1].args.token).to.equal(ctx.contracts.tokens.TST2.address);
            et.expect(logs[1].args.balance).to.equal(et.eth(50));
            et.expect(logs[1].args.fee).to.equal(et.eth(0));
            et.expect(logs[1].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[1].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[1].args.borrowIndex).to.equal(1);

            et.expect(logs[2].name).to.equal('BorrowResult');
            et.expect(logs[2].address).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[2].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[2].args.balance).to.equal(et.eth(100));
            et.expect(logs[2].args.fee).to.equal(et.eth(0));
            et.expect(logs[2].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[2].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest2.address);
            et.expect(logs[2].args.borrowIndex).to.equal(2);
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest2.address], assertEql: 0, },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },
        
        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], },
    ],
})


.test({
    desc: "borrow through borrower contract reenter over pool size",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoanAdaptorTest.testFlashBorrow', args: [
            ctx.contracts.flashLoan.address,
            Array(3).fill(ctx.contracts.flashLoanAdaptorTest.address),
            Array(3).fill(ctx.contracts.tokens.TST.address),
            Array(3).fill(et.eth(50)),
        ], expectError: 'e/insufficient-tokens-available' },
    ],
})



.test({
    desc: "borrow through EOA initiator",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoan.flashLoan', args: [
            ctx.contracts.flashLoanAdaptorTest.address,
            ctx.contracts.tokens.TST.address,
            et.eth(50),
            et.abiEncode(['address[]', 'address[]', 'uint256[]', 'uint256'], [[], [], [], 0]),
        ], onRawLogs: rawLogs => {
            let logs = rawLogs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address)
                .map(l => ctx.contracts.flashLoanAdaptorTest.interface.parseLog(l));

            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('BorrowResult');
            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(0);
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], },
    ],
})


.test({
    desc: "borrow through EOA initiator reenter",
    actions: ctx => [
        { from: ctx.wallet, send: 'flashLoan.flashLoan', args: [
            ctx.contracts.flashLoanAdaptorTest.address,
            ctx.contracts.tokens.TST.address,
            et.eth(50),
            et.abiEncode(['address[]', 'address[]', 'uint256[]', 'uint256'], [
                Array(2).fill(ctx.contracts.flashLoanAdaptorTest.address),
                Array(2).fill(ctx.contracts.tokens.TST.address),
                Array(2).fill(et.eth(50)),
                0
            ]),
        ], onRawLogs: rawLogs => {
            let logs = rawLogs.filter(l => l.address === ctx.contracts.flashLoanAdaptorTest.address)
                .map(l => ctx.contracts.flashLoanAdaptorTest.interface.parseLog(l));

            et.expect(logs.length).to.equal(2);
            et.expect(logs[0].name).to.equal('BorrowResult');
            et.expect(logs[0].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.balance).to.equal(et.eth(50));
            et.expect(logs[0].args.fee).to.equal(0);
            et.expect(logs[0].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[0].args.initiator).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.borrowIndex).to.equal(0);

            et.expect(logs[1].name).to.equal('BorrowResult');
            et.expect(logs[1].args.token).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[1].args.balance).to.equal(et.eth(100));
            et.expect(logs[1].args.fee).to.equal(0);
            et.expect(logs[1].args.sender).to.equal(ctx.contracts.flashLoan.address);
            et.expect(logs[1].args.initiator).to.equal(ctx.contracts.flashLoanAdaptorTest.address);
            et.expect(logs[1].args.borrowIndex).to.equal(1);
        }},

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoanAdaptorTest.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.flashLoan.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.euler.address], assertEql: et.eth(100), },

        { call: 'markets.getEnteredMarkets', args: [ctx.contracts.flashLoan.address], assertEql: [], },
    ],
})


.run();
