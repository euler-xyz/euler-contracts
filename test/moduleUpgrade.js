const et = require('./lib/eTestLib');

et.testSet({
    desc: "module upgrades",
})


.test({
    desc: "upgrade single-proxy module",
    actions: ctx => [
        // Attempt to upgrade module by non-admin

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

        // Upgrade to junk module

        { action: 'cb', cb: async () => {
            let factory = await ethers.getContractFactory('JunkMarketsUpgrade');
            let newModule = await (await factory.deploy()).deployed();
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([newModule.address])).wait();
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


.run();
