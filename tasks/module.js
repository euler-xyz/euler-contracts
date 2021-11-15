const child_process = require("child_process");

task("module:deploy")
    .addPositionalParam("module")
    .setAction(async (args) => {
        await run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let gitStatus = child_process.execSync('git diff --stat').toString().trim();
        if (gitStatus !== '') throw(`git tree dirty`);

        let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

        let factory = await ethers.getContractFactory(args.module);

        let tx;

        if (args.module === 'RiskManager') {
            tx = await factory.deploy(gitCommit, ctx.tokenSetup.riskManagerSettings);
        } else {
            tx = await factory.deploy(gitCommit);
        }

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
