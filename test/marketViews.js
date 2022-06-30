const et = require('./lib/eTestLib');

const badAddr = '0x1111111111111111111111111111111111111111';

et.testSet({
    desc: "market view functions",
})


.test({
    desc: "test market views with invalid tokens",
    actions: ctx => [
        // Non-failing cases

        { call: 'markets.underlyingToEToken', args: [badAddr], assertEql: et.AddressZero, },
        { call: 'markets.underlyingToDToken', args: [badAddr], assertEql: et.AddressZero, },
        { call: 'markets.underlyingToPToken', args: [badAddr], assertEql: et.AddressZero, },

        // Failing cases

        { call: 'markets.underlyingToAssetConfig', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.underlyingToAssetConfigUnresolved', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.eTokenToUnderlying', args: [badAddr], expectError: 'e/invalid-etoken', },
        { call: 'markets.eTokenToDToken', args: [badAddr], expectError: 'e/invalid-etoken', },
        { call: 'markets.dTokenToUnderlying', args: [badAddr], expectError: 'e/invalid-dtoken', },
        { call: 'markets.interestRateModel', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.interestRate', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.interestAccumulator', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.reserveFee', args: [badAddr], expectError: 'e/market-not-activated', },
        { call: 'markets.getPricingConfig', args: [badAddr], expectError: 'e/market-not-activated', },
    ],
})



.run();
