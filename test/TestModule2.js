const et = require('./lib/eTestLib');

const proxyF = async () => {

        let Proxy = await ethers.getContractFactory("Proxy");
        let proxy = await (await Proxy.deploy()).deployed();
        console.log("proxy: ",proxy.address);
    }

// console log to see if proxy address is generated
proxyF();

et.testSet({
    desc: "Log emissions via proxy",
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

        action: 'cb', cb: async () => {
                
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
})    

.test({
    desc: "Log(0) Emission",
    actions: ctx => [

        { send: 'TestModule.testEmitViaProxyNoLog', args:[proxyF()],onLogs: logs => {
            logs = logs.filter(l => l.address == ctx.contracts.TestModule.address);
            et.expect(logs.length).to.equal(0);
        }},
        ],
})  


.test({
    desc: "Log(1) Emission",
    actions: ctx => [

        { send: 'TestModule.testEmitViaProxyUnTrackAverageLiquidity', args:[proxyF()],onLogs: logs => {
            logs = logs.filter(l =>l.address == ctx.contracts.TestModule.address);
            et.expect(logs.length).to.equal(1);
        }},
        ],
})

.test({
    desc: "Log(2) Emission",
    actions: ctx => [

        { send: 'TestModule.testEmitViaProxyTrackAverageLiquidity', args:[proxyF()],onLogs: logs => {
            logs = logs.filter(l => l.address == ctx.contracts.TestModule.address);
            et.expect(logs.length).to.equal(2);
        }},
        ],
})

.test({
    desc: "Log(3) Emission",
    actions: ctx => [

        { send: 'TestModule.testEmitViaProxyTransfer', args:[proxyF()],onLogs: logs => {
            logs = logs.filter(l => l.address == ctx.contracts.TestModule.address);
            et.expect(logs.length).to.equal(3);
        }},
        ],
}) 

.test({
    desc: "Log(4) Emission",
    actions: ctx => [

        { send: 'TestModule.testEmitViaProxyRequestLiquidate', args:[proxyF()],onLogs: logs => {
            logs.filter(l => l.address == ctx.contracts.TestModule.address);
            et.expect(logs.length).to.equal(4);
        }},
        ],
}) 

.run()

