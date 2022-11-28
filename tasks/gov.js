task("gov:setAssetConfig")
    .addPositionalParam("underlying")
    .addOptionalParam("isolated")
    .addOptionalParam("cfactor")
    .addOptionalParam("bfactor")
    .addOptionalParam("twap")
    .addOptionalParam("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async (args) => {
        const isfork = args.isfork === undefined ? false : parseBool(args.isfork);
        let fork;
        if (isfork) {
            fork = await setupGovernanceFork("governor");
        }
        const et = require("../test/lib/eTestLib");
        const ctx = isfork ? fork.ctx : await et.getTaskCtx();
        const underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

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

        if (isfork) {
            const admin = fork.admin;
            await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setAssetConfig(underlying.address, updated, await ctx.txOpts()));
        } else {
            await et.taskUtils.runTx(ctx.contracts.governance.setAssetConfig(underlying.address, updated, await ctx.txOpts()));
        }
    });



task("gov:setPricingConfig")
    .addPositionalParam("underlying")
    .addPositionalParam("pricingType")
    .addPositionalParam("pricingParameter")
    .addOptionalParam("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async (args) => {
        const isfork = args.isfork === undefined ? false : parseBool(args.isfork);
        let fork;
        if (isfork) {
            fork = await setupGovernanceFork("governor");
        }
        const et = require("../test/lib/eTestLib");
        const ctx = isfork ? fork.ctx : await et.getTaskCtx();
        const underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

        if (isfork) {
            const admin = fork.admin;
            await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setPricingConfig(underlying.address, parseInt(args.pricingType), parseInt(args.pricingParameter), await ctx.txOpts()));
        } else {
            await et.taskUtils.runTx(ctx.contracts.governance.setPricingConfig(underlying.address, parseInt(args.pricingType), parseInt(args.pricingParameter), await ctx.txOpts()));
        }
    });



task("gov:installModule")
    .addVariadicPositionalParam("addrs")
    .addOptionalParam("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async (addrs) => {
        const isfork = args.isfork === undefined ? false : parseBool(args.isfork);
        let fork;
        if (isfork) {
            fork = await setupGovernanceFork("installer");
        }
        const et = require("../test/lib/eTestLib");
        const ctx = isfork ? fork.ctx : await et.getTaskCtx();

        if (isfork) {
            const admin = fork.admin;
            await et.taskUtils.runTx(ctx.contracts.installer.connect(admin).installModules(addrs, await ctx.txOpts()));
        } else {
            await et.taskUtils.runTx(ctx.contracts.installer.installModules(addrs, await ctx.txOpts()));
        }
    });



task("gov:setChainlinkPriceFeed")
    .addPositionalParam("underlying")
    .addPositionalParam("chainlinkAggregator")
    .addOptionalParam("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async (args) => {
        const isfork = args.isfork === undefined ? false : parseBool(args.isfork);
        let fork;
        if (isfork) {
            fork = await setupGovernanceFork("governor");
        }
        const et = require("../test/lib/eTestLib");
        const ctx = isfork ? fork.ctx : await et.getTaskCtx();

        const underlying = await et.taskUtils.lookupToken(ctx, args.underlying);

        if (isfork) {
            const admin = fork.admin;
            await et.taskUtils.runTx(ctx.contracts.governance.connect(admin).setChainlinkPriceFeed(underlying.address, args.chainlinkAggregator, await ctx.txOpts()));
        } else {
            await et.taskUtils.runTx(ctx.contracts.governance.setChainlinkPriceFeed(underlying.address, args.chainlinkAggregator, await ctx.txOpts()));
        }
    });



task("gov:forkAccountsAndHealthScores", "Get all unique accounts that have entered an Euler market and their health scores")
    .addPositionalParam("filename", "file name without .json suffix")
    .setAction(async ({ filename }) => {
        const fs = require("fs");

        const et = require("../test/lib/eTestLib");
        const { ctx, } = await setupGovernanceFork();

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
        
        console.log(`Number of unique addresses to parse in batches: ${uniqueAddresses.length}`);
        while (uniqueAddresses.length > 0) {
            const chunkSize = 100;
            const batch = uniqueAddresses.splice(0, chunkSize);

            console.log(`Accounts remaining to parse: ${uniqueAddresses.length}\n`);

            await Promise.all(batch.map(async account => {
                let status = await ctx.contracts.exec.liquidity(account);
                let collateralValue = status.collateralValue;
                let liabilityValue = status.liabilityValue;
                let healthScore = liabilityValue == 0 ? ethers.constants.MaxUint256 : (collateralValue * et.c1e18) / liabilityValue;

                health_scores[account] = {
                    health: healthScore / et.c1e18,
                    collateralValue,
                    liabilityValue
                };
            }));
        }

        let outputJson = JSON.stringify(health_scores);
        fs.writeFileSync(`${filename}.json`, outputJson + "\n");
    });



task("gov:forkHealthScoreDiff", "Compare the health scores of accounts from a pair of JSON files")
    .addPositionalParam("preGovActionFileName", "file name without .json suffix")
    .addPositionalParam("postGovActionFileName", "file name without .json suffix")
    .addPositionalParam("removeFilesAfterParsing", "true or false")
    .setAction(async ({ preGovActionFileName, postGovActionFileName, removeFilesAfterParsing }) => {
        const fs = require('fs');

        const prePath = `${preGovActionFileName}.json`;
        const postPath = `${postGovActionFileName}.json`;

        try {
            const pre_gov_scores = require(`../${prePath}`);
            const post_gov_scores = require(`../${postPath}`);

            let accountsInViolation = [];
            let accountsAtRisk = [];

            for (let account of Object.keys(pre_gov_scores)) {
                let collateralValueBefore = ethers.utils.formatEther(pre_gov_scores[account].collateralValue.hex);
                let liabilityValueBefore = ethers.utils.formatEther(pre_gov_scores[account].liabilityValue.hex);
                let collateralValueAfter = ethers.utils.formatEther(post_gov_scores[account].collateralValue.hex);
                let liabilityValueAfter = ethers.utils.formatEther(post_gov_scores[account].liabilityValue.hex);
                let spyModeURL = `https://app.euler.finance/account/0?spy=${account}`;
                
                let result = {
                    account,
                    spyModeURL,
                    healthScoreBefore: pre_gov_scores[account].health,
                    healthScoreAfter: post_gov_scores[account].health,
                    collateralValueBefore: parseFloat(collateralValueBefore),
                    collateralValueAfter: parseFloat(collateralValueAfter),
                    liabilityValueBefore: parseFloat(liabilityValueBefore),
                    liabilityValueAfter: parseFloat(liabilityValueAfter)
                }
                if (
                    pre_gov_scores[account].health > 1.15 &&
                    post_gov_scores[account].health >= 1 &&
                    post_gov_scores[account].health <= 1.15
                ) {
                    accountsAtRisk.push(result);
                } else if (
                    pre_gov_scores[account].health > 1 &&
                    post_gov_scores[account].health < 1
                ) {
                    accountsInViolation.push(result);
                }
            }

            const sortedAtRisk = accountsAtRisk?.sort((a, b) => (a.liabilityValueBefore > b.liabilityValueBefore ? -1 : 1));
            const sortedInViolation = accountsInViolation?.sort((a, b) => (a.liabilityValueBefore > b.liabilityValueBefore ? -1 : 1));

            if (parseBool(removeFilesAfterParsing)) {
                fs.unlinkSync(prePath);
                fs.unlinkSync(postPath);
            }

            fs.writeFileSync(`accountsAtRiskOfViolation.json`, JSON.stringify(sortedAtRisk, null, 2) + "\n");
            fs.writeFileSync(`accountsInViolation.json`, JSON.stringify(sortedInViolation, null, 2) + "\n");

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
    return { ctx, admin };
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
