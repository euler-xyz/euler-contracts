const et = require('./lib/eTestLib');

et.testSet({
    desc: "transfer dTokens",

    preActions: ctx => {
        let actions = [
            { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },
            { action: 'setAssetConfig', tok: 'TST', config: { borrowFactor: .4}, },
        ];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
        }

        for (let from of [ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
        }

        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], });

        actions.push({ from: ctx.wallet2, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        actions.push({ from: ctx.wallet2, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.01', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "basic transfers to self",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.25)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.25), },

        // can't just transfer to somebody else
        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet.address, et.eth(.1)], expectError: 'insufficient-debt-allowance', },

        // can't transferFrom to somebody else without an allowance
        { from: ctx.wallet2, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.eth(.1)], expectError: 'insufficient-debt-allowance', },

        // Just confirming wallet is *not* entered into TST
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [], },

        // but you can always transferFrom to yourself (assuming you have enough collateral)
        { from: ctx.wallet, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.eth(.1)], onLogs: allLogs => {
            {
                logs = allLogs.filter(l => l.address === ctx.contracts.dTokens.dTST.address);
                et.expect(logs.length).to.equal(2);

                et.expect(logs[0].name).to.equal('Transfer');
                et.expect(logs[0].args.from).to.equal(ctx.wallet2.address);
                et.expect(logs[0].args.to).to.equal(et.AddressZero);
                et.expect(logs[0].args.value).to.equal(et.eth(.1));

                et.expect(logs[1].name).to.equal('Transfer');
                et.expect(logs[1].args.from).to.equal(et.AddressZero);
                et.expect(logs[1].args.to).to.equal(ctx.wallet.address);
                et.expect(logs[1].args.value).to.equal(et.eth(.1));
            }

            {
                logs = allLogs.filter(l => l.address === ctx.contracts.euler.address);
                et.expect(logs.length).to.equal(5);
                et.expect(logs[0].name).to.equal('RequestTransferDToken');
                et.expect(logs[1].name).to.equal('EnterMarket');
                et.expect(logs[2].name).to.equal('Repay');
                et.expect(logs[3].name).to.equal('Borrow');
                et.expect(logs[4].name).to.equal('AssetStatus');
            }
        }},

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(.1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.15), },

        // We're now entered into TST. This is sort of an edge case also: We're using TST as collateral *and* borrowing it
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address],
          assertEql: [ctx.contracts.tokens.TST.address], },

        // Add some interest-dust, and then do a max transfer

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { action: 'jumpTimeAndMine', time: 1800, },

        { from: ctx.wallet, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.MaxUint256], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], equals: ['0.2500014', '0.0000001'], },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "approvals",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet.address, ctx.wallet3.address], assertEql: 0, },

        // we're going to approve wallet3 to transfer dTokens to wallet

        { from: ctx.wallet3, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.eth(.1)], expectError: 'insufficient-debt-allowance', },

        { from: ctx.wallet, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet3.address, et.MaxUint256], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.dTokens.dTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet3.address);
            et.assert(logs[0].args.value.eq(et.MaxUint256));
        }},
        { call: 'dTokens.dTST.debtAllowance', args: [ctx.wallet.address, ctx.wallet3.address], assertEql: et.MaxUint256, },

        { from: ctx.wallet3, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.eth(.1)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(.1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.65), },

        // wallet3 can't transfer to wallet2 though

        { from: ctx.wallet3, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet.address, ctx.wallet2.address, et.eth(.05)], expectError: 'insufficient-debt-allowance', },

        // wallet2 still can't transfer to anyone
        { from: ctx.wallet2, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},
        { from: ctx.wallet2, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},
        { from: ctx.wallet2, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet.address, ctx.wallet3.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},
        { from: ctx.wallet2, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet3.address, ctx.wallet.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},

        // and neither can wallet
        { from: ctx.wallet, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet3.address, ctx.wallet2.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},
        { from: ctx.wallet, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, et.eth(.1)], expectError: 'insufficient-debt-allowance',},

        // unless wallet3 approves
        { send: 'tokens.TST2.mint', args: [ctx.wallet3.address, et.eth(100)], },
        { from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },
        { from: ctx.wallet3, send: 'dTokens.dTST.approveDebt', args: [0, ctx.wallet.address, et.eth(.1)], },
        { from: ctx.wallet, send: 'dTokens.dTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, et.eth(.1)], onLogs: logs => {
            logs = logs.filter(l => l.name === 'Approval');
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].address).to.equal(ctx.contracts.dTokens.dTST.address);
            et.expect(logs[0].args.owner).to.equal(ctx.wallet3.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.value.toNumber()).to.equal(0);
        }},
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(.1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.55), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], assertEql: et.eth(.1), },

    ],
})



.test({
    desc: "transfer with zero amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address], assertEql: [], },

        // revert on self-transfer of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet.address, et.eth(0)], },

        // did not get entered
        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address], assertEql: [], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
    ],
})



.test({
    desc: "self-transfer with valid amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        // revert on self-transfer of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet2.address, et.eth(.1)], expectError: 'e/self-transfer', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },
    ],
})


.test({
    desc: "self-transfer with zero amount",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        // revert on self-transfer of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet2.address, et.eth(0)], expectError: 'e/self-transfer', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },
    ],
})


.test({
    desc: "self-transfer with max amount exceeding balance",
    actions: ctx => [
        { from: ctx.wallet2, send: 'dTokens.dTST.borrow', args: [0, et.eth(.75)], },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(0), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },

        // revert on self-transfer of dToken
        { from: ctx.wallet2, send: 'dTokens.dTST.transfer', args: [ctx.wallet2.address, et.MaxUint256], expectError: 'e/self-transfer', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(.75), },
    ],
})


.run();
