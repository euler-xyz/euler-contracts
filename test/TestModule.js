const et = require('./lib/eTestLib');

et.testSet({
    desc: "Log(0/1/2/3/4) emissions via proxy",
})

.test({

    desc: "Install module",
    actions: ctx => [
        // Fail to install module
        {
        action: 'cb', cb: async () => {
            let TestModule = await ethers.getContractFactory('TestModule');
            let testModule = await (await TestModule.deploy()).deployed();

            let errMsg;

            try {
                await (await ctx.contracts.installer.connect(ctx.wallet).installModules([testModule.address])).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('reverted without a reason');
        },

        action: 'cb', cb: async () => {
            let Proxy = await ethers.getContractFactory("Proxy");
            let proxy = await (await Proxy.deploy()).deployed();
            let proxyAddress = proxy.address;
        }
    },
    ]
})    

.test({
    desc: "Log(0) Emission",
    actions: ctx => [
        {
            call: 'TestModule.'
        }

        ]
       
})  


