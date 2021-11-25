const et = require('./lib/eTestLib');

et.testSet({
    desc: "module upgrades and upgrade admin",
})


.test({
    desc: "upgrade single-proxy module",
    actions: ctx => [
        // Fail to upgrade module by non-admin

        { action: 'cb', cb: async () => {
            let factory = await ethers.getContractFactory('JunkMarketsUpgrade');
            let newModule = await (await factory.deploy()).deployed();

            let errMsg;

            try {
                await (await ctx.contracts.installer.connect(ctx.wallet2).installModules([newModule.address])).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('e/installer/unauthorized');
        }},

        // Fail to upgrade to non-contract address

        { action: 'cb', cb: async () => {
            let errMsg;

            try {
                await (await ctx.contracts.installer.installModules(['0x0000000000000000000000000000000000000001'])).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('reverted without a reason');
        }},

        // Fail to upgrade to contract without moduleId() method

        { action: 'cb', cb: async () => {
            let errMsg;

            try {
                await (await ctx.contracts.installer.installModules([ctx.contracts.tokens.TST.address])).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('reverted');
        }},

        // Upgrade to junk module

        { action: 'cb', cb: async () => {
            let factory = await ethers.getContractFactory('JunkMarketsUpgrade');
            let newModule = await (await factory.deploy()).deployed();
            let res = await (await ctx.contracts.installer.connect(ctx.wallet).installModules([newModule.address])).wait();
            et.expect(res.events.length).to.equal(1);
            et.expect(res.events[0].event).to.equal('InstallerInstallModule');
            let args = res.events[0].args;
            et.expect(args.moduleId.toNumber()).to.equal(2);
            et.expect(args.moduleImpl).to.equal(newModule.address);
            et.expect(args.moduleGitCommit).to.equal('0x0000000000000000000000000000000000000000000000000000000000001234');
        }},

        // Verify it throws

        { call: 'markets.getEnteredMarkets', args: [et.AddressZero], expectError: 'JUNK_UPGRADE_TEST_FAILURE', },

        // Upgrade it back to original

        { action: 'cb', cb: async () => {
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([ctx.contracts.modules.markets.address])).wait();
        }},

        // OK now

        { call: 'markets.getEnteredMarkets', args: [ctx.wallet.address], assertEql: [], },
    ],
})


.test({
    desc: "upgrade multi-proxy module",
    actions: ctx => [
        { call: 'eTokens.eTST.name', args: [], assertEql: 'Euler Pool: Test Token', },
        { call: 'eTokens.eTST2.name', args: [], assertEql: 'Euler Pool: Test Token 2', },
        { call: 'eTokens.eWETH.name', args: [], assertEql: 'Euler Pool: Wrapped ETH', },

        // Upgrade

        { action: 'cb', cb: async () => {
            let factory = await ethers.getContractFactory('JunkETokenUpgrade');
            let newModule = await (await factory.deploy()).deployed();
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([newModule.address])).wait();
        }},

        { call: 'eTokens.eTST.name', args: [], assertEql: 'JUNK_UPGRADE_NAME', },
        { call: 'eTokens.eTST2.name', args: [], assertEql: 'JUNK_UPGRADE_NAME', },
        { call: 'eTokens.eWETH.name', args: [], assertEql: 'JUNK_UPGRADE_NAME', },

        // Upgrade it back to original

        { action: 'cb', cb: async () => {
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([ctx.contracts.modules.eToken.address])).wait();
        }},

        { call: 'eTokens.eTST.name', args: [], assertEql: 'Euler Pool: Test Token', },
        { call: 'eTokens.eTST2.name', args: [], assertEql: 'Euler Pool: Test Token 2', },
        { call: 'eTokens.eWETH.name', args: [], assertEql: 'Euler Pool: Wrapped ETH', },
    ],
})


.test({
    desc: "retrieve current upgrade admin",
    actions: ctx => [
        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "successfully update and retrieve new upgrade admin",
    actions: ctx => [
        { from: ctx.wallet, send: 'installer.setUpgradeAdmin', args: [ctx.wallet2.address], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('InstallerSetUpgradeAdmin');
            et.expect(logs[0].args.newUpgradeAdmin).to.equal(ctx.wallet2.address);
        }},

        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet2.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should revert if non upgrade admin tries to set new upgrade admin",
    actions: ctx => [
        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet2, send: 'installer.setUpgradeAdmin', args: [ctx.wallet3.address], expectError: 'e/installer/unauthorized', },

        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should not allow setting zero address as upgrade admin",
    actions: ctx => [
        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet, send: 'installer.setUpgradeAdmin', args: [et.AddressZero], expectError: 'e/installer/bad-admin-addr', },

        { call: 'installer.getUpgradeAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.run();
