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
    .addPositionalParam("token", "symbol")
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
    .addPositionalParam("token", "symbol")
    .addPositionalParam("who")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);
        let who = await et.taskUtils.lookupAddress(ctx, args.who);

        console.log(et.dumpObj(await tok.balanceOf(who)));
    });

task("testtoken:changeOwner")
    .addPositionalParam("token", "symbol")
    .addPositionalParam("newOwner")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);

        await et.taskUtils.runTx(tok.changeOwner(args.newOwner));
    });

task("testtoken:transfer")
    .addPositionalParam("token")
    .addPositionalParam("who")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let tok = await et.taskUtils.lookupToken(ctx, args.token);
        let who = await et.taskUtils.lookupAddress(ctx, args.who);

        let decimals = await tok.decimals();

        await et.taskUtils.runTx(tok.transfer(who, ethers.utils.parseUnits(args.amount, decimals)));
    });

task("testtokenfaucet:setthreshold")
    .addPositionalParam("token", "symbol")
    .addPositionalParam("threshold", "token amount issued to testers")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();
        
        const tok = await et.taskUtils.lookupToken(ctx, args.token);
        const decimals = await tok.decimals();
        const faucet = await ethers.getContractAt("TestERC20TokenFaucet", ctx.tokenSetup.testERC20TokenFaucet);

        await et.taskUtils.runTx(faucet.setThreshold(tok.address, ethers.utils.parseUnits(args.threshold, decimals)));
    });

task("testtokenfaucet:getthreshold")
    .addPositionalParam("token", "symbol")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        const tok = await et.taskUtils.lookupToken(ctx, args.token);
        const decimals = await tok.decimals();
        const faucet = await ethers.getContractAt("TestERC20TokenFaucet", ctx.tokenSetup.testERC20TokenFaucet);

        const threshold = await faucet.getThreshold(tok.address);
        console.log(`${threshold / Math.pow(10, decimals)} ${args.token}`);
    });
