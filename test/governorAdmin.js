const et = require('./lib/eTestLib');

et.testSet({
    desc: "getting and setting governor admin and IRM",
})


.test({
    desc: "retrieve current governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "successfully update and retrieve new governor admin",
    actions: ctx => [
        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [ctx.wallet2.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('InstallerSetGovernorAdmin');
            et.expect(logs[0].args.newGovernorAdmin).to.equal(ctx.wallet2.address);
        }},

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet2.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should revert if non governor admin tries to set new governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet2, send: 'installer.setGovernorAdmin', args: [ctx.wallet3.address], expectError: 'e/installer/unauthorized', },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should not allow setting zero address as governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [et.AddressZero], expectError: 'e/installer/bad-gov-addr', },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should revert if non governor admin tries to set IRM_ZERO for TST token",
    actions: ctx => [
        { from: ctx.wallet2, send: 'governance.setIRM', args: [ctx.contracts.tokens.TST.address, ctx.moduleIds.IRM_FIXED, et.HashZero], expectError: 'e/gov/unauthorized', },
    ],
})


.test({
    desc: "should update governor admin, change the IRM for TST token, and retrieve the IRM",
    actions: ctx => [
        { call: 'markets.interestRateModel', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.equal(ctx.moduleIds.IRM_DEFAULT);
        }},

        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [ctx.wallet2.address], },

        { from: ctx.wallet2, send: 'governance.setIRM', args: [ctx.contracts.tokens.TST.address, ctx.moduleIds.IRM_FIXED, et.HashZero], },

        { call: 'markets.interestRateModel', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r).to.equal(ctx.moduleIds.IRM_FIXED);
        }},
    ],
})


.test({
    desc: "should not set IRM for unactivated market",
    actions: ctx => [
        { from: ctx.wallet, send: 'governance.setIRM', args: [et.AddressZero, ctx.moduleIds.IRM_FIXED, et.HashZero], expectError: 'e/gov/underlying-not-activated', },
    ],
})


.test({
    desc: "should update asset configuration for TST token, and retrieve the new configuration",
    actions: ctx => [
        { call: 'markets.underlyingToAssetConfig', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect(r.borrowIsolated).to.equal(false);
            et.expect(r.collateralFactor).to.equal(3e9);
            et.expect(r.borrowFactor).to.equal(0.28 * 4e9);
            et.expect(r.twapWindow).to.equal(1800);
        }},

        { action: 'cb', cb: async () => {
            let eToken = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens.TST.address);

            let newConfig = {
                eTokenAddress: eToken,
                borrowIsolated: true,
                collateralFactor: Math.floor(0.9 * 4e9),
                borrowFactor: Math.floor(0.14 * 4e9),
                twapWindow: 1800
            };

            await (await ctx.contracts.governance.connect(ctx.wallet).setAssetConfig(ctx.contracts.tokens.TST.address, newConfig)).wait();

            let currentConfig = await ctx.contracts.markets.underlyingToAssetConfig(ctx.contracts.tokens.TST.address);
            et.expect(currentConfig.eTokenAddress).to.equal(newConfig.eTokenAddress);
            et.expect(currentConfig.borrowIsolated).to.equal(newConfig.borrowIsolated);
            et.expect(currentConfig.collateralFactor).to.equal(newConfig.collateralFactor);
            et.expect(currentConfig.borrowFactor).to.equal(newConfig.borrowFactor);
            et.expect(currentConfig.twapWindow).to.eql(newConfig.twapWindow);
        }},
        
    ],
})


.test({
    desc: "should fail to update asset config with an incorrect eToken address",
    actions: ctx => [
        { action: 'cb', cb: async () => {
            let currentConfig = await ctx.contracts.markets.underlyingToAssetConfig(ctx.contracts.tokens.TST.address);

            let newConfig = {
                eTokenAddress: et.AddressZero,
                borrowIsolated: false,
                collateralFactor: Math.floor(0.9 * 4e9),
                borrowFactor: 1.6e9,
                twapWindow: 1800
            };

            let errMsg;

            try {
                await (await ctx.contracts.governance.connect(ctx.wallet).setAssetConfig(ctx.contracts.tokens.TST.address, newConfig)).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('e/gov/etoken-mismatch');

            let latestConfig = await ctx.contracts.markets.underlyingToAssetConfig(ctx.contracts.tokens.TST.address);
            et.expect(currentConfig).to.eql(latestConfig);
        }},
    ]
})


.run();
