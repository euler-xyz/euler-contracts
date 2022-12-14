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
        } else if (args.module === 'SwapHandler1Inch') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.oneInch, ctx.tokenSetup.existingContracts.swapRouterV2, ctx.tokenSetup.existingContracts.swapRouterV3, await ctx.txOpts());
        } else if (args.module === 'SwapHandlerUniAutoRouter') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.swapRouter02, ctx.tokenSetup.existingContracts.swapRouterV2, ctx.tokenSetup.existingContracts.swapRouterV3, await ctx.txOpts());
        } else if (args.module === 'SwapHandlerUniswapV3') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.swapRouterV3, await ctx.txOpts());
        } else if (args.module === 'FlashLoan') {
            tx = await factory.deploy(ctx.contracts.euler.address, ctx.contracts.exec.address, ctx.contracts.markets.address, await ctx.txOpts());
        } else if (args.module === 'EulStakes') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.eulToken, await ctx.txOpts());
        } else if (args.module === 'EulDistributor') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.eulToken, ctx.contracts.eulStakes.address, await ctx.txOpts());
        } else if (args.module === 'EulDistributorOwner') {
            tx = await factory.deploy(ctx.contracts.eulDistributor.address, process.env.EUL_DIST_OWNER, process.env.EUL_DIST_UPDATER, await ctx.txOpts());
        } else if (args.module === 'EulerSimpleLens') {
            tx = await factory.deploy(gitCommit, ctx.contracts.euler.address, await ctx.txOpts());
        } else if (args.module === 'WSTETHOracle') {
            tx = await factory.deploy(ctx.tokenSetup.existingTokens.STETH.address, ctx.tokenSetup.existingContracts.chainlinkAggregator_STETH_ETH, await ctx.txOpts());
        } else if (args.module === 'WBTCOracle') {
            tx = await factory.deploy(ctx.tokenSetup.existingContracts.chainlinkAggregator_WBTC_BTC, ctx.tokenSetup.existingContracts.chainlinkAggregator_BTC_ETH, await ctx.txOpts());
        } else if (args.module === 'ChainlinkBasedOracle') {
            let sym = process.env.SYM;
            if (!sym) throw(`provide SYM env var`);

            let underlyingUSDChainlinkAggregator = ctx.tokenSetup.existingContracts[`chainlinkAggregator_${sym}_USD`];
            if (!underlyingUSDChainlinkAggregator) throw(`unable to lookup chainlinkAggregator_${sym}_ETH in existingContracts`);

            let ETHUSDChainlinkAggregator = ctx.tokenSetup.existingContracts.chainlinkAggregator_ETH_USD;
            if (!ETHUSDChainlinkAggregator) throw(`unable to lookup chainlinkAggregator_ETH_USD_ETH in existingContracts`);

            let desc = `${sym} / ETH`;

            tx = await factory.deploy(underlyingUSDChainlinkAggregator, ETHUSDChainlinkAggregator, desc, await ctx.txOpts());
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
