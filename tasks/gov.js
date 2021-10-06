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

        await et.taskUtils.runTx(ctx.contracts.governance.setAssetConfig(underlying.address, updated));
    });



task("gov:setPricingConfig")
    .addPositionalParam("underlying")
    .addPositionalParam("pricingType")
    .addPositionalParam("pricingParameter")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

        await et.taskUtils.runTx(ctx.contracts.governance.setPricingConfig(underlying.address, parseInt(args.pricingType), parseInt(args.pricingParameter), { gasLimit: 150000, }));
    });



function parseBool(v) {
    if (v === 'true') return true;
    if (v === 'false') return false;
    throw(`unexpected boolean value: ${v}`);
}

function parseFactor(v) {
    let n = parseFloat(v);
    if (isNaN(n) || n < 0 || n > 1) throw(`unexpected factor value: ${v}`);
    return Math.floor(n * 4e9);
}

function parseTwap(v) {
    let n = parseInt(v);
    if (isNaN(n) || n <= 0) throw(`unexpected twap value: ${v}`);
    return n;
}
