task("testtoken:deploy")
    .addPositionalParam("name")
    .addPositionalParam("symbol")
    .addOptionalParam("decimals", "decimals", "18")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tx = await ctx.factories.TestERC20.deploy(args.name, args.symbol, parseInt(args.decimals), true);
        console.log(`Transaction: ${tx.deployTransaction.hash}`);

        let result = await tx.deployed();
        console.log(`Contract: ${result.address}`);
    });

task("testtoken:mint")
    .addPositionalParam("token")
    .addPositionalParam("who")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);
        let who = await et.taskUtils.lookupAddress(ctx, args.who);

        let decimals = await tok.decimals();

        await et.taskUtils.runTx(tok.mint(who, ethers.utils.parseUnits(args.amount, decimals)));
    });

task("testtoken:balanceOf")
    .addPositionalParam("token")
    .addPositionalParam("who")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);
        let who = await et.taskUtils.lookupAddress(ctx, args.who);

        console.log(et.dumpObj(await tok.balanceOf(who)));
    });

task("testtoken:changeOwner")
    .addPositionalParam("token")
    .addPositionalParam("newOwner")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);

        await et.taskUtils.runTx(tok.changeOwner(args.newOwner));
    });
