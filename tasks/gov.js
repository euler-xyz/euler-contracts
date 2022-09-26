task("gov:forkModuleInstall")
    .addVariadicPositionalParam("addrs")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        const upgradeAdminAddress = await ctx.contracts.installer.getUpgradeAdmin();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [upgradeAdminAddress],
        });

        const upgradeAdmin = await ethers.getSigner(upgradeAdminAddress);

        console.log('\nExecuting governance action with upgrade admin...')

        await network.provider.send("hardhat_setBalance", [
            upgradeAdminAddress,
            "0x56BC75E2D63100000", // top up signer with 100 Ether
        ]);

        await et.taskUtils.runTx(ctx.contracts.installer.connect(upgradeAdmin).installModules(args.addrs, await ctx.txOpts()));
    });

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


task("gov:forkHealthScoreDiff")
    .addPositionalParam("preActionFileName")
    .addPositionalParam("postActionFileName")
    .addPositionalParam("removeFilesAfterParsing", "true or false")
    .setAction(async ({preActionFileName, postActionFileName, removeFilesAfterParsing}) => {
        const fs = require('fs');
        const prePath = `${preActionFileName}.json`;
        const postPath = `${postActionFileName}.json`;
        

        try {
            const pre_gov_scores = require(`../${prePath}`);
            const post_gov_scores = require(`../${postPath}`);
            
            for (i in pre_gov_scores) {
                // console.log(`pre health score ${pre_gov_scores[i].health} ${pre_gov_scores[i].violation}`);
                // console.log(`post health score ${post_gov_scores[i].health} ${pre_gov_scores[i].violation}`);
                if (
                    pre_gov_scores[i].health > 1 && 
                    post_gov_scores[i].health < 1 // &&
                    // post_gov_scores[i].violation == true
                ) {
                    console.log(`Account ${post_gov_scores[i].account} is in violation due to governance action`);
                    console.log(`pre health score ${pre_gov_scores[i].health}`);
                    console.log(`post health score ${post_gov_scores[i].health}`);
                }
            }

            if (removeFilesAfterParsing == "true") {
                fs.unlinkSync(prePath);
                fs.unlinkSync(postPath);
            }

        } catch (e) {
            console.error(e.message);
        }
    })



task("gov:forkAccountsAndHealthScores")
    .addPositionalParam("filename")
    .setAction(async ({filename}) => {
        const fs = require("fs");

        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

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

        const MKR_ABI = [{"constant":true,"inputs":[],"name":"name","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[],"name":"stop","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"},{"name":"wad","type":"uint256"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"owner_","type":"address"}],"name":"setOwner","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"totalSupply","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transferFrom","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"decimals","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"},{"name":"wad","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wad","type":"uint256"}],"name":"burn","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"name_","type":"bytes32"}],"name":"setName","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"}],"name":"balanceOf","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"stopped","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"authority_","type":"address"}],"name":"setAuthority","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"owner","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":true,"inputs":[],"name":"symbol","outputs":[{"name":"","type":"bytes32"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"},{"name":"wad","type":"uint256"}],"name":"burn","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"wad","type":"uint256"}],"name":"mint","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"push","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"dst","type":"address"},{"name":"wad","type":"uint256"}],"name":"move","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":false,"inputs":[],"name":"start","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[],"name":"authority","outputs":[{"name":"","type":"address"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"guy","type":"address"}],"name":"approve","outputs":[{"name":"","type":"bool"}],"payable":false,"stateMutability":"nonpayable","type":"function"},{"constant":true,"inputs":[{"name":"src","type":"address"},{"name":"guy","type":"address"}],"name":"allowance","outputs":[{"name":"","type":"uint256"}],"payable":false,"stateMutability":"view","type":"function"},{"constant":false,"inputs":[{"name":"src","type":"address"},{"name":"wad","type":"uint256"}],"name":"pull","outputs":[],"payable":false,"stateMutability":"nonpayable","type":"function"},{"inputs":[{"name":"symbol_","type":"bytes32"}],"payable":false,"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"name":"guy","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Mint","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"guy","type":"address"},{"indexed":false,"name":"wad","type":"uint256"}],"name":"Burn","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"authority","type":"address"}],"name":"LogSetAuthority","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"}],"name":"LogSetOwner","type":"event"},{"anonymous":true,"inputs":[{"indexed":true,"name":"sig","type":"bytes4"},{"indexed":true,"name":"guy","type":"address"},{"indexed":true,"name":"foo","type":"bytes32"},{"indexed":true,"name":"bar","type":"bytes32"},{"indexed":false,"name":"wad","type":"uint256"},{"indexed":false,"name":"fax","type":"bytes"}],"name":"LogNote","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"from","type":"address"},{"indexed":true,"name":"to","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Transfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"name":"owner","type":"address"},{"indexed":true,"name":"spender","type":"address"},{"indexed":false,"name":"value","type":"uint256"}],"name":"Approval","type":"event"}]

        // compute health scores
        let health_scores = [];
        for (let account of uniqueAddresses) {
            let detLiq = await ctx.contracts.exec.callStatic.detailedLiquidity(account);
            let markets = [];

            let totalLiabilities = ethers.BigNumber.from(0);
            let totalAssets = ethers.BigNumber.from(0);

            for (let asset of detLiq) {
                let addr = asset.underlying.toLowerCase();
                let token = await ethers.getContractAt('IERC20', addr);
                let decimals = await token.decimals();
                // TODO fix for tokens like MKR this will revert due to returning bytes32
                // let sym = await token.symbol();

                let eToken = await ctx.contracts.markets.underlyingToEToken(addr);

                totalLiabilities = totalLiabilities.add(asset.status.liabilityValue);
                totalAssets = totalAssets.add(asset.status.collateralValue);

                // markets.push({ addr, sym, decimals, eToken, status: asset.status, });
                markets.push({ addr, decimals, eToken, status: asset.status, });
            }

            let health;
            let violation;

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

                health_scores.push({
                    account: account,
                    health: ethers.utils.formatEther(health),
                    violation: violation
                });
            }
        }

        let outputJson = JSON.stringify(health_scores);
        fs.writeFileSync(`${filename}.json`, outputJson + "\n");
    })

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
