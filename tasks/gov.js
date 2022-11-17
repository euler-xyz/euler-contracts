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


task("gov:forkAccountsAndHealthScores", "Get all unique accounts that have entered an Euler market and their health scores")
    .addPositionalParam("filename", "file name without .json suffix")
    .setAction(async ({ filename }) => {
        const fs = require("fs");

        const {et, ctx, } = await setupGovernanceFork();

        const transactions = await ctx.contracts.euler.queryFilter(
            "EnterMarket",
            "earliest",
            "latest",
        );

        let result = [];
        for (let i = 0; i < transactions.length; i++) {
            let temp = {};
            temp.account = transactions[i].args.account;
            temp.underlying = transactions[i].args.underlying;
            result.push(temp);
        }

        // unique event arguments based on accounts
        const key = 'account';
        const arrayUniqueByKey = [...new Map(result.map(item =>
            [item[key], item])).values()];

        // unique addresses regardless of markets 
        const uniqueAddresses = [...new Set(arrayUniqueByKey.map(item => item.account))];

        // compute health scores
        let health_scores = {};
        for (let account of uniqueAddresses) {
            let detLiq = await ctx.contracts.exec.callStatic.detailedLiquidity(account);
            let totalLiabilities = ethers.BigNumber.from(0);
            let totalAssets = ethers.BigNumber.from(0);

            for (let asset of detLiq) {
                totalLiabilities = totalLiabilities.add(asset.status.liabilityValue);
                totalAssets = totalAssets.add(asset.status.collateralValue);
            }

            let health = 0;
            let violation = false;

            if (totalAssets > 0) {
                health = totalAssets.mul(et.c1e18);

                if (totalLiabilities > 0) {
                    health = totalAssets.mul(et.c1e18).div(totalLiabilities);
                }

                if (health.gte(et.c1e18)) {
                    violation = false;
                    console.log(`Account ${account} not in violation`);
                } else {
                    violation = true;
                    console.log(`Account ${account} in violation`);
                }

                health_scores[account] = {
                    health: ethers.utils.formatEther(health),
                    violation: violation
                };
            }
        }

        let outputJson = JSON.stringify(health_scores);
        fs.writeFileSync(`${filename}.json`, outputJson + "\n");
    });

task("gov:forkModuleInstall", "Impersonate installer admin on mainnet fork and install a module")
    .addVariadicPositionalParam("addrs")
    .setAction(async (addrs) => {
        const {et, ctx, admin} = await setupGovernanceFork("installer");
        await et.taskUtils.runTx(ctx.contracts.installer.connect(admin).installModules(addrs, await ctx.txOpts()));
    });

task("gov:forkSetPricingConfig", "Impersonate governor admin on mainnet fork and set pricing config for an asset")
    .addPositionalParam("underlying", "underlying mainnet asset address")
    .addPositionalParam("pricingType")
    .addPositionalParam("pricingParameter")
    .setAction(async ({ underlying, pricingType, pricingParameter }) => {
        const {et, ctx, admin} = await setupGovernanceFork("governor");

        let curr = await ctx.contracts.markets.getPricingConfig(underlying);

        console.log("Current pricing config:");
        console.log(et.dumpObj(curr));
        console.log("\n");

        await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setPricingConfig(underlying, parseInt(pricingType), parseInt(pricingParameter), await ctx.txOpts()));

        curr = await ctx.contracts.markets.getPricingConfig(underlying);

        console.log("\nNEW pricing config:");
        console.log(et.dumpObj(curr));
        console.log("\n");
    });

task("gov:forkSetChainlinkPriceFeed", "Impersonate governor admin on mainnet fork and set chainlink price feed for an asset")
    .addPositionalParam("underlying", "underlying mainnet asset address")
    .addPositionalParam("chainlinkAggregator")
    .setAction(async ({ underlying, chainlinkAggregator }) => {
        const {et, ctx, admin} = await setupGovernanceFork("governor");

        await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setChainlinkPriceFeed(underlying, chainlinkAggregator, await ctx.txOpts()));
    });

task("gov:forkSetAssetConfig", "Impersonate governor admin and run governance actions against governance contract")
    .addPositionalParam("underlying", "underlying mainnet asset address")
    .addOptionalParam("isolated")
    .addOptionalParam("cfactor")
    .addOptionalParam("bfactor")
    .addOptionalParam("twap")
    .setAction(async ({ underlying, isolated, cfactor, bfactor, twap }) => {
        const {et, ctx, admin} = await setupGovernanceFork("governor");

        let curr = await ctx.contracts.markets.underlyingToAssetConfig(underlying);

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

        await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setAssetConfig(underlying, updated, await ctx.txOpts()));
    });

task("gov:forkHealthScoreDiff", "Compare the health scores of accounts from a pair of JSON files")
    .addPositionalParam("preGovActionFileName", "file name without .json suffix")
    .addPositionalParam("postGovActionFileName", "file name without .json suffix")
    .addPositionalParam("removeFilesAfterParsing", "true or false")
    .setAction(async ({preGovActionFileName, postGovActionFileName, removeFilesAfterParsing}) => {
        const fs = require('fs');
        
        const prePath = `${preGovActionFileName}.json`;
        const postPath = `${postGovActionFileName}.json`;
        
        try {
            const pre_gov_scores = require(`../${prePath}`);
            const post_gov_scores = require(`../${postPath}`);

            for (let account of Object.keys(pre_gov_scores)) {
                if (
                    pre_gov_scores[account].health > 1 &&
                    post_gov_scores[account].health < 1
                ) {
                    console.log(`Account ${account} is in violation due to governance action`);
                    console.log(`pre health score ${pre_gov_scores[account].health}`);
                    console.log(`post health score ${post_gov_scores[account].health}`);
                }
            }

            if (removeFilesAfterParsing === "true") {
                fs.unlinkSync(prePath);
                fs.unlinkSync(postPath);
            }

        } catch (e) {
            console.error(e.message);
        }
    });

async function setupGovernanceFork(adminType = null) {
    let admin;

    await hre.run("compile");
    const et = require("../test/lib/eTestLib");

    if (network.name !== 'localhost') throw 'Only localhost!';
    const ctx = await et.getTaskCtx('mainnet');

    if (adminType === "governor") {
        const govAdminAddress = await ctx.contracts.governance.getGovernorAdmin();
        impersonateAccount(govAdminAddress);
        await setBalance(govAdminAddress);
        admin = await ethers.getSigner(govAdminAddress);
    } else if (adminType === "installer") {
        const upgradeAdminAddress = await ctx.contracts.installer.getUpgradeAdmin();
        impersonateAccount(upgradeAdminAddress);
        await setBalance(upgradeAdminAddress);
        admin = await ethers.getSigner(upgradeAdminAddress);
    }
    return {et, ctx, admin};
}

async function impersonateAccount(account) {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [account],
    });
}

async function setBalance(account) {
    await network.provider.send("hardhat_setBalance", [
        account,
        "0x56BC75E2D63100000", // top up signer with 100 Ether
    ]);
}

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
