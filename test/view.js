const et = require('./lib/eTestLib');
const scenarios = require('./lib/scenarios');


et.testSet({
    desc: "views",

    preActions: scenarios.basicLiquidity(),
})



.test({
    desc: "basic view, APR/APY",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_FIXED', },
        { action: 'setReserveFee', underlying: 'TST2', fee: 0, },

        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
            let [tst, tst2] = r.markets;
            et.expect(tst.symbol).to.equal('TST');
            et.expect(tst2.symbol).to.equal('TST2');

            // Not exactly 10% because we used different "seconds per year" in the IRM
            et.equals(tst2.borrowAPY.div(1e9), 0.105244, 0.000001); // exp(0.100066) = 1.105243861763355833

            // Utilisation is 50%, so suppliers get half the interest per unit

            et.equals(tst2.supplyAPY.div(1e9), 0.051306, 0.000001); // exp(0.100066 / 2) = 1.051305788894627857
        }, },

        { action: 'setReserveFee', underlying: 'TST2', fee: 0.06, },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
            let [tst, tst2] = r.markets;
            et.expect(tst.symbol).to.equal('TST');
            et.expect(tst2.symbol).to.equal('TST2');

            // Borrow rates are the same

            // Not exactly 10% because we used different "seconds per year" in the IRM
            et.equals(tst2.borrowAPY.div(1e9), 0.105244, 0.000001); // exp(0.100066) = 1.105243861763355833

            // But supply rates have decreased to account for the fee:

            et.equals(tst2.supplyAPY.div(1e9), 0.048154, 0.000001); // exp(0.100066 / 2 * (1 - 0.06)) = 1.048154522328655174
        }, },

        { call: 'eulerGeneralView.doQueryAccountLiquidity', args: [ctx.contracts.euler.address, [ctx.wallet.address, ctx.wallet2.address]], onResult: r => {
            et.expect(r.length).to.equal(2);
            et.expect(r[0].markets.length).to.equal(2);
            et.expect(r[1].markets.length).to.equal(2);
        }, },
    ],
})



.test({
    desc: "batch query",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST2', irm: 'IRM_FIXED', },
        { action: 'setReserveFee', underlying: 'TST2', fee: 0, },

        { send: 'dTokens.dTST2.borrow', args: [0, et.eth(5)], },

        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
            ctx.stash.r = r
        }, },

        { call: 'eulerGeneralView.doQueryBatch', args: [
                Array(2).fill({ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], })
            ], assertResult: r => {
                et.expect(r[0]).to.deep.equal(ctx.stash.r);
                et.expect(r[1]).to.deep.equal(ctx.stash.r);
            },
        },
    ],
})



.test({
    desc: "inactive market",
    actions: ctx => [
        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [ctx.contracts.tokens.TST4.address], }], assertResult: r => {
            let tst4 = r.markets[2];
            et.expect(tst4.symbol).to.equal('TST4');
            et.expect(tst4.eTokenAddr).to.equal(et.AddressZero)
            et.equals(tst4.borrowAPY, 0);
            et.equals(tst4.supplyAPY, 0);
        }, },
    ],
})



.test({
    desc: "address zero",
    actions: ctx => [
        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], assertResult: r => {
            et.expect(r.enteredMarkets).to.eql([]);
        }, },
    ],
})



.test({
    desc: "query IRM",
    actions: ctx => [
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_DEFAULT', },
        { call: 'eulerGeneralView.doQueryIRM', args: [{ eulerContract: ctx.contracts.euler.address, underlying: ctx.contracts.tokens.TST.address, }], assertResult: r => {
            et.assert(r.kinkAPY.gt(r.baseAPY));
            et.assert(r.maxAPY.gt(r.kinkAPY));

            et.assert(r.kinkAPY.gt(r.kinkSupplyAPY));
            et.assert(r.maxAPY.gt(r.maxSupplyAPY));

            let kink = r.kink.toNumber();
            et.assert(kink > 0 && kink < 2**32);
        }, },
    ],
})


.test({
    desc: "handle MKR like tokens returning bytes32 for name and symbol",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['name/return-bytes32', []], },   
        { send: 'tokens.TST.configure', args: ['symbol/return-bytes32', []], },   
        { call: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [ctx.contracts.tokens.TST.address], }], assertResult: r => {
            et.expect(r.markets[0].name).to.include('Test Token');
            et.expect(r.markets[0].symbol).to.include('TST');
        }, },
    ],
})


.run();
