const et = require('./lib/eTestLib');

et.testSet({
    desc: "deposit/withdraw balances, with interest",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, et.eth(100)], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        for (let from of [ctx.wallet4]) {
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
    desc: "basic interest earning flow, no reserves",
    actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth(1), '0.000000000001'], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        { call: 'tokens.TST.balanceOf', args: [ctx.wallet4.address], assertEql: et.eth(1), },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], assertEql: et.eth(1), },

        // Go ahead 1 year (+ 1 second because I did it this way by accident at first, don't want to bother redoing calculations below)

        { action: 'jumpTime', time: 365*86400 + 1, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        // 10% APY interest charged:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], assertEql: et.eth('1.105170921404897917'), },

        // eToken balanceOf unchanged:
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },

        // eToken balanceOfUnderlying increases (one less wei than the amount owed):
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: [et.eth('1.105170921404897916'), '0.00000001'] },

        // Now wallet2 deposits and gets different exchange rate
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: et.eth(0), },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.equals(logs[0].args.value, 0.904, 0.001); // the internal amount
        }},
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], assertEql: et.eth('0.999999999999999999'), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: [0.904, 0.001], },

        // Go ahead 1 year

        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { action: 'checkpointTime', },
        { action: 'jumpTime', time: 365*86400, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        // balanceOf calls stay the same

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], equals: [0.904, 0.001], },
        { call: 'eTokens.eTST.totalSupply', args: [], equals: [1.904, 0.001], },

        // Earnings:

        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['1.166190218541122110', '0.01'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: ['1.055212543104786187', '0.01'], },
        { call: 'eTokens.eTST.totalSupplyUnderlying', args: [], equals: '2.221402761645908297', },

        // More interest is now owed:

        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], assertEql: et.eth('1.221402761645908299'), },

        // Additional interest owed = 1.221402761645908299 - 1.105170921404897917 = 0.116231840241010382

        // Total additional earnings: (1.166190218541122110 - 1.105170921404897916) + (1.055212543104786187 - 1) = 0.116231840241010381
        // This matches the additional interest owed (except for the rounding increase)

        // wallet1 has earned more because it started with larger balance. wallet2 should have earned:
        // 0.116231840241010382 / (1 + 1.105170921404897917) = 0.05521254310478618771
        // ... which matches, after truncating to 18 decimals.
    ],
})


.test({
    desc: "basic interest earning flow, with reserves",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0.1, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], onResult: r => {
            let tst = r.markets[0];
            et.equals(tst.borrowAPY, et.units('0.105244346078570209478701625', 27));
            et.equals(tst.supplyAPY, et.units('0.094239711147365655602112334', 27), et.units(et.DefaultReserve, 27));
            // untouchedSupply APY: tst.borrowAPY * .9 = 0.094719911470713188530831462
        }, },

        // Go ahead 1 year, with no reserve credits in between

        { action: 'jumpTime', time: 365.2425 * 86400, },
        { send: 'eTokens.eTST.touch', args: [], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('AssetStatus');
            let args = logs[0].args;
            // Compute exchange rate. Matches the balanceOfUnderlying() below, since user has exactly 1 eTST:
            et.equals(args.totalBorrows.mul(et.c1e18).div(args.totalBalances), '1.094719911470713189', 0.01);
        }},

        // Interest charged, matches borrowAPY above:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: '1.105244346078570210', },

        // eToken balanceOf unchanged:
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(1), },

        // eToken balanceOfUnderlying increases. 10% less than the amount owed, because of reserve fee. Matches "untouchedSupplyAPY" above:
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['1.094719911470713189', '0.00000001'], },

        // Conversion methods
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(1)], equals: ['1.094719911470713189', '0.00000001'], },
        { call: 'eTokens.eTST.convertBalanceToUnderlying', args: [et.eth(2)], equals: [et.eth('1.094719911470713189').mul(2), '0.00000001'], },
        { call: 'eTokens.eTST.convertUnderlyingToBalance', args: [et.eth('1.094719911470713189')], equals: [et.eth('1'), '0.000000000001'], },
        { call: 'eTokens.eTST.convertUnderlyingToBalance', args: [et.eth('1.094719911470713189').div(2)], equals: [et.eth('0.5'), '.000000000001'], },

        // 1.105244346078570210 - 1.094719911470713189 = 0.010524434607857021
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.010524434607857021', '0.000000001'], },


        // Jump another year:

        { action: 'checkpointTime', },
        { action: 'jumpTimeAndMine', time: 365.2425 * 86400, },

        // More interest charged (prev balance * (1+borrowAPY)):
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: '1.221565064538646276', },

        // More interest earned (prev balance * (1+untouchedSupplyAPY)):
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['1.198411684570446122', '0.00000001'], },

        // Original reserve balance times supplyAPY, plus 10% of current interest accrued
        // (0.010524434607857021 * 1.094719911470713188593610243) + (1.221565064538646276 - 1.105244346078570210)*.1
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.023153379968200152', '0.00000001'], },
    ],
})



.test({
    desc: "split interest earning flow, with reserves",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0.1, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], onResult: r => {
            let tst = r.markets[0];
            et.equals(tst.borrowAPY, et.units('0.105244346078570209478701625', 27));
            et.equals(tst.supplyAPY, et.units('0.046059133709789858497725776', 27));
            // untouchedSupply APY: (tst.borrowAPY * .9) / 2 = 0.047359955735356594265415731
        }, },

        // Go ahead 1 year

        { action: 'jumpTime', time: 365.2425 * 86400, },
        { send: 'eTokens.eTST.touch', args: [], },

        // Same as in basic case:
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: '1.105244346078570210', },

        // eToken balanceOfUnderlying increases. 10% less than the amount owed, because of reserve fee. Matches untouchedSupplyAPY above:
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['1.047359955735356594', '0.00000001'] },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: ['1.047359955735356594', '0.00000001'] },

        // Same as in basic case:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.010524434607857021', '0.00000001'], },


        // Get new APYs:

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], onResult: r => {
            let tst = r.markets[0];
            et.equals(tst.borrowAPY, et.units('0.105244346078570209478701625', 27));
            et.equals(tst.supplyAPY, et.units('0.048416583057772105844407061', 27));
            // untouchedSupplyAPY = 0.049727551487822095990584654
        }, },

        { action: 'checkpointTime', },
        { action: 'jumpTimeAndMine', time: 365.2425 * 86400, },

        // More interest charged (prev balance * (1+borrowAPY)):
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet4.address], equals: '1.221565064538646276', },

        // More interest earned (prev balance * (1+supplyAPY)):
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['1.099442601860469611', '0.00000001'], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet2.address], equals: ['1.099442601860469611', '0.00000001'], },

        // Original reserve balance times supplyAPY, plus 10% of current interest accrued
        // (0.010524434607857021 * 1.049727551487822095990584654) + (1.221565064538646276 - 1.105244346078570210)*.1
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.022679860817707054', '0.00000001'], },
    ],
})



.test({
    desc: "pool-donation interest earning flow, with reserves",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0.1, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], onResult: r => {
            let tst = r.markets[0];
            et.equals(tst.borrowAPY, et.units('0.105244346078570209478701625', 27));
            et.equals(tst.supplyAPY, et.units('0.094239711147365655602112334', 27), '0.00000001');
        }},

        { from: ctx.wallet2, send: 'tokens.TST.transfer', args: [ctx.contracts.euler.address, et.eth(1)], },
        { action: 'checkpointTime', },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], onResult: r => {
            let tst = r.markets[0];
            et.equals(tst.borrowAPY, et.units('0.105244346078570209478701625', 27));
            et.equals(tst.supplyAPY, et.units('0.0460591337844726578053667', 27));
        }},

        // Go ahead 1 year

        { action: 'jumpTime', time: 365.2425 * 86400, },
        { send: 'eTokens.eTST.touch', args: [], },

        // Double starting balance due to donation
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], equals: ['2.0947199', '0.0000001'], },

        // But reserves still 10%:
        { call: 'eTokens.eTST.reserveBalanceUnderlying', args: [], equals: ['0.010524434', '0.0000001'], },
    ],
})



.test({
    desc: "round down internal balance on deposit",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        // Jump ahead

        { action: 'jumpTime', time: 365*86400*10, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        // Exchange rate is ~2.718. Too small, rounded away:
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, 1], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        // Still too small:
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, 2], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },

        // This works:
        { action: 'snapshot', },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, 3], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1, },
        { action: 'revert', },

        // This works too:
        { action: 'snapshot', },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, 200], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 73, }, // floor(200 / 2.718)
        { action: 'revert', },
    ],
})


.test({
    desc: "round up internal balance on withdraw",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },
        { send: 'eTokens.eTST.deposit', args: [0, 2], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        // Jump ahead

        { action: 'jumpTime', time: 365*86400, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        // Still haven't earned enough interest to actually make any gain:

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 2, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: '99.999999999999999998', },

        { send: 'eTokens.eTST.withdraw', args: [0, 2], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: '100', },
    ],
})



.test({
    desc: "mint/burn with exchange rate rounding",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, et.eth(1)], },
        { send: 'eTokens.eTST.deposit', args: [0, 1], },

        { action: 'setReserveFee', underlying: 'TST', fee: 0, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet4, send: 'dTokens.dTST.borrow', args: [0, et.eth(1)], },
        { action: 'checkpointTime', },

        // Jump ahead

        { action: 'jumpTime', time: 365*86400*20, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_ZERO', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1, },
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], equals: '99.999999999999999999', },

        { send: 'eTokens.eTST.withdraw', args: [0, 1], },

        // Now exchange rate is != 1

        { send: 'eTokens.eTST.mint', args: [0, 1], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => ctx.stash.bal = r, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], onResult: r => et.expect(r).to.equal(ctx.stash.bal), },
        { send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'dTokens.dTST.balanceOfExact', args: [ctx.wallet.address], assertEql: 0, },

        // with interest accrued
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },
        { send: 'eTokens.eTST.mint', args: [0, 1], },

        { action: 'checkpointTime', },
        { action: 'jumpTimeAndMine', time: 86400*20, },

        
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], onResult: r => et.expect(r).to.equal(ctx.stash.bal), },
        // debt rounded up
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: () => ctx.stash.bal.add(1), },

        { send: 'eTokens.eTST.burn', args: [0, et.MaxUint256], },
        { call: 'eTokens.eTST.balanceOfUnderlying', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'dTokens.dTST.balanceOf', args: [ctx.wallet.address], assertEql: 1, },
    ],
})


.run();
