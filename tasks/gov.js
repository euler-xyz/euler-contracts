task("gov:forkSetPricingConfig", "Impersonate governor admin and run governance actions against governance contract")
    .addPositionalParam("underlying")
    .addPositionalParam("pricingType")
    .addPositionalParam("pricingParameter")
    .setAction(async ({ underlying, pricingType, pricingParameter }) => {
        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        const govAdminAddress = await ctx.contracts.governance.getGovernorAdmin();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [govAdminAddress],
        });

        const govAdmin = await ethers.getSigner(govAdminAddress);

        console.log('\nExecuting governance action with governor admin...')

        await network.provider.send("hardhat_setBalance", [
            govAdminAddress,
            "0x56BC75E2D63100000", // top up signer with 100 Ether
        ]);

        let underlying_asset = await et.taskUtils.lookupToken(ctx, underlying);
        let curr = await ctx.contracts.markets.getPricingConfig(underlying_asset.address);

        console.log("Current pricing config:");
        console.log(et.dumpObj(curr));
        console.log("\n");

        await et.taskUtils.runTx(ctx.contracts.governance.connect(govAdmin).setPricingConfig(underlying_asset.address, parseInt(pricingType), parseInt(pricingParameter), await ctx.txOpts()));

        curr = await ctx.contracts.markets.getPricingConfig(underlying_asset.address);

        console.log("\nNEW pricing config:");
        console.log(et.dumpObj(curr));
        console.log("\n");
    })



task("gov:forkSetAssetConfig", "Impersonate governor admin and run governance actions against governance contract")
    .addPositionalParam("underlying")
    .addOptionalParam("isolated")
    .addOptionalParam("cfactor")
    .addOptionalParam("bfactor")
    .addOptionalParam("twap")
    .setAction(async ({ underlying, isolated, cfactor, bfactor, twap }) => {
        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        const govAdminAddress = await ctx.contracts.governance.getGovernorAdmin();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [govAdminAddress],
        });

        const govAdmin = await ethers.getSigner(govAdminAddress);

        console.log('\nExecuting governance action with governor admin...')

        await network.provider.send("hardhat_setBalance", [
            govAdminAddress,
            "0x56BC75E2D63100000", // top up signer with 100 Ether
        ]);

        let underlying_asset = await et.taskUtils.lookupToken(ctx, underlying);
        let curr = await ctx.contracts.markets.underlyingToAssetConfig(underlying_asset.address);

        console.log("Current asset config:");
        console.log(et.dumpObj(curr));
        console.log("\n\n");

        let updated = {};

        updated.eTokenAddress = curr.eTokenAddress;
        updated.borrowIsolated = isolated === undefined ? curr.borrowIsolated : parseBool(isolated);
        updated.collateralFactor = cfactor === undefined ? curr.collateralFactor : parseFactor(cfactor);
        updated.borrowFactor = bfactor === undefined ? curr.borrowFactor : parseFactor(bfactor);
        updated.twapWindow = twap === undefined ? curr.twapWindow : parseTwap(twap);

        console.log("NEW asset config:");
        console.log(et.dumpObj(updated));
        console.log("\n\n");

        await et.taskUtils.runTx(ctx.contracts.governance.connect(govAdmin).setAssetConfig(underlying_asset.address, updated, await ctx.txOpts()));
    })



task("gov:setAssetConfig")
    .addPositionalParam("underlying")
    .addOptionalParam("isolated")
    .addOptionalParam("cfactor")
    .addOptionalParam("bfactor")
    .addOptionalParam("twap")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

        let curr = await ctx.contracts.markets.underlyingToAssetConfig(underlying.address);

        console.log("Current asset config:");
        console.log(et.dumpObj(curr));
        console.log("\n\n");

        let updated = {};

        updated.eTokenAddress = curr.eTokenAddress;
        updated.borrowIsolated = args.isolated === undefined ? curr.borrowIsolated : parseBool(args.isolated);
        updated.collateralFactor = args.cfactor === undefined ? curr.collateralFactor : parseFactor(args.cfactor);
        updated.borrowFactor = args.bfactor === undefined ? curr.borrowFactor : parseFactor(args.bfactor);
        updated.twapWindow = args.twap === undefined ? curr.twapWindow : parseTwap(args.twap);

        console.log("NEW asset config:");
        console.log(et.dumpObj(updated));
        console.log("\n\n");

        await et.taskUtils.runTx(ctx.contracts.governance.setAssetConfig(underlying.address, updated, await ctx.txOpts()));
    });



task("gov:setPricingConfig")
    .addPositionalParam("underlying")
    .addPositionalParam("pricingType")
    .addPositionalParam("pricingParameter")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

        await et.taskUtils.runTx(ctx.contracts.governance.setPricingConfig(underlying.address, parseInt(args.pricingType), parseInt(args.pricingParameter), await ctx.txOpts()));
    });



function parseBool(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    throw (`unexpected boolean value: ${v}`);
}

function parseFactor(v) {
    let n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 1) throw (`unexpected factor value: ${v}`);
    return Math.floor(n * 4e9);
}

function parseTwap(v) {
    let n = parseInt(v);
    if (isNaN(n) || n <= 0) throw (`unexpected twap value: ${v}`);
    return n;
}
