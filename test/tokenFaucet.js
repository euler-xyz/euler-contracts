const et = require('./lib/eTestLib');

et.testSet({
    desc: "ERC20 test token faucet",
    preActions: ctx => [
        { action: 'cb', cb: async () => {
            // deploy faucet

            ctx.contracts.TestERC20Faucet = await (await ctx.factories.TestERC20TokenFaucet.deploy()).deployed();
        }}
    ]
})


.test({
    desc: "only owner can set threshold",
    actions: ctx => [
        { from: ctx.wallet2, send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, 2], 
            expectError: 'unauthorized', 
        },

        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, 2], },

        { call: 'TestERC20Faucet.getThreshold', args: [ctx.contracts.tokens.TST.address], assertEql: 2, },
    ],
})


.test({
    desc: "owner can set threshold for multiple tokens",
    actions: ctx => [
        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, 2], },

        { call: 'TestERC20Faucet.getThreshold', args: [ctx.contracts.tokens.TST.address], assertEql: 2, },

        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST2.address, 12], },

        { call: 'TestERC20Faucet.getThreshold', args: [ctx.contracts.tokens.TST2.address], assertEql: 12, },
    ],
})


.test({
    desc: "zero threshold reverts",
    actions: ctx => [
        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, 0], 
            expectError: 'setThreshold: threshold must be greater than zero', 
        },
    ],
})


.test({
    desc: "only owner can reduce faucet balance",
    actions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, 100], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: 100, },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        { from: ctx.wallet2, send: 'TestERC20Faucet.reduceFaucetBalance', args: [ctx.contracts.tokens.TST.address, 2], 
            expectError: 'unauthorized', 
        },

        { send: 'TestERC20Faucet.reduceFaucetBalance', args: [ctx.contracts.tokens.TST.address, 2], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: 98, },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 2, },
    ],
})


.test({
    desc: "owner can reduce faucet balance to zero using max uint256",
    actions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, 100], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: 100, },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        { send: 'TestERC20Faucet.reduceFaucetBalance', args: [ctx.contracts.tokens.TST.address, et.MaxUint256], },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: 0, },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 100, },
    ],
})


.test({
    desc: "withdraw only tops up user balance and does not issue full threshold",
    actions: ctx => [
        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, et.eth(1)], },

        { call: 'TestERC20Faucet.getThreshold', args: [ctx.contracts.tokens.TST.address], assertEql: et.eth(1), },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },

        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(50)], },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(1), },

        { from: ctx.wallet2, send: 'tokens.TST.transfer', args: [ctx.wallet3.address, et.eth(0.5)], },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet3.address], assertEql: et.eth(0.5), },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet3.address], assertEql: et.eth(0.5), },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(1), },
    ],
})


.test({
    desc: "withdraw reverts if threshold is not set",
    actions: ctx => [
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },

        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(50)], },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], 
            expectError: 'withdraw: balance not below threshold', 
        },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },
    ],
})


.test({
    desc: "withdraw reverts if faucet balance is below withdrawal amount",
    actions: ctx => [
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },

        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(0.5)], },

        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, et.eth(1)], },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], 
            expectError: 'ERC20: transfer amount exceeds balance', 
        },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },
    ],
})


.test({
    desc: "withdraw reverts if user balance is not below threshold",
    actions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(0.5)], },

        { send: 'tokens.TST.mint', args: [ctx.wallet2.address, et.eth(0.5)], },

        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, et.eth(0.5)], },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], 
            expectError: 'withdraw: balance not below threshold', 
        },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.5), },
    ],
})


.test({
    desc: "user can withdraw multiple tokkens",
    actions: ctx => [
        { send: 'tokens.TST.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(0.5)], },
        { send: 'tokens.TST2.mint', args: [ctx.contracts.TestERC20Faucet.address, et.eth(0.5)], },

        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST.address, et.eth(0.25)], },
        { send: 'TestERC20Faucet.setThreshold', args: [ctx.contracts.tokens.TST2.address, et.eth(0.2)], },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST.address, ], },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.25), },

        { from: ctx.wallet2, send: 'TestERC20Faucet.withdraw', args: [ctx.contracts.tokens.TST2.address, ], },
        { call: 'tokens.TST2.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0.2), },

        { call: 'tokens.TST.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: et.eth(0.25), },
        { call: 'tokens.TST2.balanceOf', args: [ctx.contracts.TestERC20Faucet.address], assertEql: et.eth(0.3), },
    ],
})



.run();
