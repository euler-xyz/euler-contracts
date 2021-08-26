const et = require('./lib/eTestLib');

et.testSet({
    desc: "Log emissions via proxy",

    preActions: ctx => {
        let actions = [
            { action: 'cb', cb: async () => {
            let Proxy = await ethers.getContractFactory("Proxy");
            let proxy = await (await Proxy.deploy()).deployed();

            let errMsg;

            try {
                await (await ctx.contracts.installer.connect(ctx.wallet).installModules([proxy.address])).wait();
            } catch (e) {
                errMsg = e.message;
            }

            et.expect(errMsg).to.contain('reverted without a reason');
        } 
            },
        ]
    }
})

.test({
    desc: "Install module",
    actions: ctx => [
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
    },
    ]
})    

.test({
    desc: "Log(0) Emission",
    actions: ctx => [
        
        { call: 'TestModule.testEmitViaProxyNoLog', args:[proxy.address],assertEql: 'case 0'},
    ],
})  

.test({
    desc: "Log(1) Emission",
    actions: ctx => [
    
        { call: 'TestModule.testEmitViaProxyUnTrackAverageLiquidity', args:[proxy.address],assertEql: 'case 1'},
    ],
})

.test({
    desc: "Log(2) Emission",
    actions: ctx => [

        { call: 'TestModule.testEmitViaProxyTrackAverageLiquidity', args:[proxy.address],assertEql: 'case 2'},
    ],
})

.test({
    desc: "Log(3) Emission",
    actions: ctx => [
    
        { call: 'TestModule.testEmitViaProxyTransfer', args:[proxy.address],assertEql: 'case 3'},
    ],
}) 

.test({
    desc: "Log(4) Emission",
    actions: ctx => [
        
       { call: 'TestModule.testEmitViaProxyRequestLiquidate', args:[proxy.address],assertEql: 'case 4'},
    ],
}) 

.run()

