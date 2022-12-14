const et = require('./lib/eTestLib');

et.testSet({
    desc: "reserves",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet3, ctx.wallet4]) {
            actions.push({ from, send: 'tokens.TST2.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
            actions.push({ from, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },);
            actions.push({ from, send: 'eTokens.eTST2.deposit', args: [0, et.eth(50)], });
        }

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.1', });
        actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.2', });

        actions.push({ action: 'jumpTime', time: 31*60, });

        return actions;
    },
})


.test({
    desc: "reserves",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: et.eth('59.999999999999999999'), },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },

        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], equals: ['5.041955', '0.000001'], },

        // 0.041955 * 0.075 = 0.003146625
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.003146', '0.000001'], },

        // After fees: 0.041955 - 0.003146 = 0.038809
        // wallet should get 5/6 of this: 0.03234 (plus original 50)
        // wallet2 should get 1/6 of this: 0.00646 (plus original 10)

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['50.03234', '0.00001'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: ['10.00646', '0.00001'], },

        // Some more interest earned:

        { action: 'jumpTimeAndMine', time: 90*86400, },
        { action: 'checkpointTime', },

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet3.address], equals: ['5.167823', '0.000001'], },

        // 0.167823 * 0.075 = 0.012586
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.012586', '0.000001'], },

        // Internal units: 0.012554
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: ['0.012554', '0.000001'], },


        // Now let's try to withdraw some reserves:

        { from: ctx.wallet2, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet4.address, et.eth(0.005)], expectError: 'e/gov/unauthorized', },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet4.address, et.eth(0.005)], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet4.address], equals: ['0.005', '0.000001'], },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: ['0.007554', '0.000001'], },

        // Withdraw max:

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, et.MaxUint256], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet5.address], equals: ['0.007554', '0.000001'], },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },

        // More starts to accrue now:

        { action: 'jumpTimeAndMine', time: 15, },

        { call: 'eTokens.eTST.reserveBalance', args: [], equals: ['0.000000015', '0.000000001'], },
    ],
})


.test({
    desc: "withdraw more than reserve balance",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '59.999999999999999999', },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },

        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet4.address, et.eth(1)], expectError: 'e/gov/insufficient-reserves', },
    ],
})


.test({
    desc: "withdraw max uint without any deposit is a no-op as amount is zero",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: '0.000000000001', },

        { call: 'eTokens.eTST.totalSupply', args: [], equals: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '0.000000000001', },

        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, et.eth(1)], expectError: 'e/gov/insufficient-reserves', },
        // uint maxAmount = assetCache.reserveBalance - INITIAL_RESERVES;
        // if (amount == type(uint).max) amount = maxAmount;
        // this will not revert: require(amount <= maxAmount, "e/gov/insufficient-reserves"); amount will be zero without any deposits
        // this will not revert: require(assetStorage.reserveBalance >= INITIAL_RESERVES, "e/gov/reserves-depleted");
        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, et.MaxUint256], onLogs: logs => {
            et.expect(logs.length).to.equal(3);

            et.expect(logs[0].name).to.equal('Deposit');
            et.expect(logs[0].args.amount).to.equal(0);
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.account).to.equal(ctx.wallet5.address);

            et.expect(logs[1].name).to.equal('AssetStatus');
            et.expect(logs[1].args.reserveBalance).to.equal(et.BN(et.DefaultReserve));
            et.expect(logs[1].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[1].args.totalBorrows).to.equal(0);
            et.expect(logs[1].args.totalBalances).to.equal(et.BN(et.DefaultReserve));

            et.expect(logs[2].name).to.equal('GovConvertReserves');
            et.expect(logs[2].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[2].args.amount).to.equal(0);
            et.expect(logs[2].args.recipient).to.equal(ctx.wallet5.address);
        } },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet5.address], equals: 0, },

        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },
    ],
})


.test({
    desc: "withdraw zero without any deposit is a no-op as amount is zero",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: '0.000000000001', },

        { call: 'eTokens.eTST.totalSupply', args: [], equals: et.BN(et.DefaultReserve), },
        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '0.000000000001', },

        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, et.eth(1)], expectError: 'e/gov/insufficient-reserves', },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(3);

            et.expect(logs[0].name).to.equal('Deposit');
            et.expect(logs[0].args.amount).to.equal(0);
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.account).to.equal(ctx.wallet5.address);

            et.expect(logs[1].name).to.equal('AssetStatus');
            et.expect(logs[1].args.reserveBalance).to.equal(et.BN(et.DefaultReserve));
            et.expect(logs[1].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[1].args.totalBorrows).to.equal(0);
            et.expect(logs[1].args.totalBalances).to.equal(et.BN(et.DefaultReserve));

            et.expect(logs[2].name).to.equal('GovConvertReserves');
            et.expect(logs[2].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[2].args.amount).to.equal(0);
            et.expect(logs[2].args.recipient).to.equal(ctx.wallet5.address);
        } },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet5.address], equals: 0, },

        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },
    ],
})


.test({
    desc: "withdraw zero with deposit is a no-op as amount is zero",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(50)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(10)], },

        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '59.999999999999999999', },
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },

        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(5)], },
        { action: 'checkpointTime', },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        { from: ctx.wallet, send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST.address, ctx.wallet5.address, 0], onLogs: logs => {
            et.expect(logs.length).to.equal(3);

            et.expect(logs[0].name).to.equal('Deposit');
            et.expect(logs[0].args.amount).to.equal(0);
            et.expect(logs[0].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[0].args.account).to.equal(ctx.wallet5.address);

            et.expect(logs[2].name).to.equal('GovConvertReserves');
            et.expect(logs[2].args.underlying).to.equal(ctx.contracts.tokens.TST.address);
            et.expect(logs[2].args.amount).to.equal(0);
            et.expect(logs[2].args.recipient).to.equal(ctx.wallet5.address);
        } },
    ],
})


.test({
    desc: "set reserve fee for non activated market",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST4', fee: 0.01, expectError: 'e/gov/underlying-not-activated', },
    ],
})


.test({
    desc: "set reserve fee out of bounds",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 1.01, expectError: 'e/gov/bad-reserve-fee', },
    ],
})


.test({
    desc: "convert reserves on non activated market",
    actions: ctx => [
        { send: 'governance.convertReserves', args: [ctx.contracts.tokens.TST4.address, ctx.wallet5.address, et.MaxUint256], expectError: 'e/gov/underlying-not-activated',  },
    ],
})


.test({
    desc: "reserves overflow small amount",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.075, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { action: 'updateUniswapPrice', pair: 'TST/WETH', price: '0.000000000000000001', },
        { action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '10000000000', },

        { from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth('1000000000000000')], },
        { from: ctx.wallet, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet, send: 'eTokens.eTST2.deposit', args: [0, et.MaxUint256], },
        { from: ctx.wallet, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { from: ctx.wallet, send: 'eTokens.eTST.mint', args: [0, et.eth("2594990292056783.4")], },

        { action: 'jumpTimeAndMine', time: 30.5*86400, },

        // Reserves are not updated, because it would've caused e/small-amount-too-large-to-encode overflow
        { call: 'eTokens.eTST.reserveBalance', args: [], equals: et.BN(et.DefaultReserve), },
    ],
})

.run();
