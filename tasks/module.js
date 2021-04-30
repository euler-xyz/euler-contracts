task("module:deploy")
    .addPositionalParam("module")
    .setAction(async (args) => {
        await run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let factory = await ethers.getContractFactory(args.module);

        let constructorArgs = undefined;

        if (args.module === 'RiskManager') constructorArgs = ctx.tokenSetup.riskManagerSettings;

        let tx = await factory.deploy(constructorArgs);
        console.log(`Transaction: ${tx.deployTransaction.hash}`);

        let result = await tx.deployed();
        console.log(`Contract: ${result.address}`);
    });

task("module:install")
    .addVariadicPositionalParam("addrs")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        await et.taskUtils.runTx(ctx.contracts.installer.installModules(args.addrs));
    });
