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

        { callStatic: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
            let [tst, tst2] = r.markets;
            et.expect(tst.symbol).to.equal('TST');
            et.expect(tst2.symbol).to.equal('TST2');

            et.equals(tst2.borrowAPR.div(1e9), 0.100066, 0.000001); // Not exactly 10% because we used different "seconds per year" in the IRM
            et.equals(tst2.borrowAPY.div(1e9), 0.105244, 0.000001); // exp(0.100066) = 1.105243861763355833

            // Utilisation is 50%, so suppliers get half the interest per unit

            et.equals(tst2.supplyAPR.div(1e9), 0.100066 / 2, 0.000001);
            et.equals(tst2.supplyAPY.div(1e9), 0.051306, 0.000001); // exp(0.100066 / 2) = 1.051305788894627857
        }, },

        { action: 'setReserveFee', underlying: 'TST2', fee: 0.06, },

        { callStatic: 'eulerGeneralView.doQuery', args: [{ eulerContract: ctx.contracts.euler.address, account: ctx.wallet.address, markets: [], }], assertResult: r => {
            let [tst, tst2] = r.markets;
            et.expect(tst.symbol).to.equal('TST');
            et.expect(tst2.symbol).to.equal('TST2');

            // Borrow rates are the same

            et.equals(tst2.borrowAPR.div(1e9), 0.100066, 0.000001); // Not exactly 10% because we used different "seconds per year" in the IRM
            et.equals(tst2.borrowAPY.div(1e9), 0.105244, 0.000001); // exp(0.100066) = 1.105243861763355833

            // But supply rates have decreased to account for the fee:

            et.equals(tst2.supplyAPR.div(1e9), 0.100066 / 2 * (1 - 0.06), 0.000001);
            et.equals(tst2.supplyAPY.div(1e9), 0.048154, 0.000001); // exp(0.100066 / 2 * (1 - 0.06)) = 1.048154522328655174
        }, },
    ],
})




.run();
