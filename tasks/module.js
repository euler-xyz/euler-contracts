const child_process = require("child_process");

task("module:deploy")
    .addPositionalParam("module")
    .setAction(async (args) => {
        await run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let gitStatus = child_process.execSync('git diff --stat contracts/').toString().trim();
        if (gitStatus !== '') throw(`git tree dirty`);

        let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

        let factory = await ethers.getContractFactory(args.module);

        let tx;

        if (args.module === 'RiskManager') {
            tx = await factory.deploy(gitCommit, ctx.tokenSetup.riskManagerSettings, await ctx.txOpts());
        } else if (args.module === 'Swap') {
            tx = await factory.deploy(gitCommit, ctx.tokenSetup.existingContracts.swapRouter, ctx.tokenSetup.existingContracts.oneInch, await ctx.txOpts());
        } else if (args.module === 'FlashLoan') {
            tx = await factory.deploy(ctx.contracts.euler.address, ctx.contracts.exec.address, ctx.contracts.markets.address, await ctx.txOpts());
        } else if (args.module === 'EulStakes') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.eulToken, await ctx.txOpts());
        } else if (args.module === 'EulDistributor') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.eulToken, ctx.contracts.eulStakes.address, await ctx.txOpts());
        } else {
            tx = await factory.deploy(gitCommit, await ctx.txOpts());
        }

        console.log(`Transaction: ${tx.deployTransaction.hash}`);

        let result = await tx.deployed();
        console.log(`Contract: ${result.address}`);
    });

task("module:deployEuler")
    .addPositionalParam("admin")
    .addPositionalParam("installer")
    .setAction(async (args) => {
        await run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let factory = await ethers.getContractFactory("Euler");

        let tx = await factory.deploy(args.admin, args.installer, await ctx.txOpts());

        console.log(`Transaction: ${tx.deployTransaction.hash}`);

        let result = await tx.deployed();
        console.log(`Contract: ${result.address}`);
    });

task("module:install")
    .addVariadicPositionalParam("addrs")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        await et.taskUtils.runTx(ctx.contracts.installer.installModules(args.addrs, await ctx.txOpts()));
    });

task("module:queryInstalled")
    .addPositionalParam("moduleId")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let impl = await ctx.contracts.euler.moduleIdToImplementation(args.moduleId);

        let c = await ethers.getContractAt('BaseModule', impl);
        let moduleGitCommit = impl === ethers.constants.AddressZero ? 'N/A' : (await c.moduleGitCommit()).substr(-40);

        let proxy = await ctx.contracts.euler.moduleIdToProxy(args.moduleId);

        console.log(`installed moduleId ${args.moduleId}:`);
        console.log(`  Impl: ${impl}`);
        console.log(`  Proxy: ${proxy}`);
        console.log(`  moduleGitCommit: ${moduleGitCommit}`);
    });

task("module:queryImpl")
    .addPositionalParam("addr")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let c = await ethers.getContractAt('BaseModule', args.addr);

        let moduleId = (await c.moduleId()).toNumber();
        let moduleGitCommit = (await c.moduleGitCommit()).substr(-40);

        console.log(`module at address ${args.addr}:`);
        console.log(`  moduleId: ${moduleId}`);
        console.log(`  moduleGitCommit: ${moduleGitCommit}`);
    });
