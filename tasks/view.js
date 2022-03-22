task("view")
    .addPositionalParam("market")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let market = await et.taskUtils.lookupToken(ctx, args.market);

        let res = await ctx.contracts.eulerGeneralView.callStatic.doQuery({ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [market.address], });

        console.log(et.dumpObj(res));
    });


task("view:account")
    .addPositionalParam("addr")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let res = await ctx.contracts.eulerGeneralView.callStatic.doQuery({ eulerContract: ctx.contracts.euler.address, account: args.addr, markets: [], });

        console.log(et.dumpObj(res));
    });


task("view:detailedLiquidity")
    .addPositionalParam("addr")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let res = await ctx.contracts.exec.callStatic.detailedLiquidity(args.addr);

        console.log(et.dumpObj(res));
    });



task("view:queryIRM")
    .addPositionalParam("market")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let market = await et.taskUtils.lookupToken(ctx, args.market);

        let res = await ctx.contracts.eulerGeneralView.doQueryIRM({ eulerContract: ctx.contracts.euler.address, underlying: market.address, });

        console.log(et.dumpObj(res));
    });
