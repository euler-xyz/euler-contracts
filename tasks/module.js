task("module:deploy")
    .addPositionalParam("module")
    .setAction(async (args) => {
        await run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx('staging');

        let factory = await ethers.getContractFactory(args.module);

        let tx;

        if (args.module === 'RiskManager') {
            tx = await factory.deploy(ctx.tokenSetup.riskManagerSettings);
        } else {
            tx = await factory.deploy();
        }

        console.log(`Transaction: ${tx.deployTransaction.hash}`);

        let result = await tx.deployed();
        console.log(`Contract: ${result.address}`);
    });

task("module:install")
    .addVariadicPositionalParam("addrs")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx('staging');

        await et.taskUtils.runTx(ctx.contracts.installer.installModules(args.addrs));
    });
