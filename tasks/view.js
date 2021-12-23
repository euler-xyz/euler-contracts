task("markets:healthScoreDiff")
    .setAction(async () => {
        const fs = require('fs');
        const prePath = "pre_health_scores.json";
        const postPath = "post_health_scores.json";
        const pre_gov_scores = require(`../${prePath}`);
        const post_gov_scores = require(`../${postPath}`);
        
        for (i in pre_gov_scores) {
            if (
                post_gov_scores[i].violation == true
            ) {
                console.log(`Account ${post_gov_scores[i].account} is in violation due to governance action`);
                console.log(`pre health score ${pre_gov_scores[i].health}`);
                console.log(`post health score ${post_gov_scores[i].health}`);
            }
        }

        // delete files
        fs.unlinkSync(prePath);
        fs.unlinkSync(postPath);
    })

task("markets:forkAccounts")
    .addPositionalParam("filename")
    .setAction(async ({filename}) => {
        const fs = require("fs");

        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        // event EnterMarket(address indexed underlying, address indexed account);
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

        // return unique event args based on accounts
        const key = 'account';
        const arrayUniqueByKey = [...new Map(result.map(item =>
        [item[key], item])).values()];
        // console.log(result.length);
        // console.log(arrayUniqueByKey.length);

        // return unique addresses regardless of markets 
        const uniqueAddresses = [...new Set(arrayUniqueByKey.map(item => item.account))];
        // console.log(uniqueAddresses.length);
        // console.log(uniqueAddresses);

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
                let sym = await token.symbol();
    
                let eToken = await ctx.contracts.markets.underlyingToEToken(addr);
            
                totalLiabilities = totalLiabilities.add(asset.status.liabilityValue);
                totalAssets = totalAssets.add(asset.status.collateralValue);

                markets.push({ addr, sym, decimals, eToken, status: asset.status, });
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
            // console.log(`Account ${account} health = ${ethers.utils.formatEther(health)}`);
        }

        let outputJson = JSON.stringify(health_scores);
        fs.writeFileSync(`${filename}.json`, outputJson + "\n");
    })



task("view")
    .addPositionalParam("market")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let market = await et.taskUtils.lookupToken(ctx, args.market);

        let res = await ctx.contracts.eulerGeneralView.callStatic.doQuery({ eulerContract: ctx.contracts.euler.address, account: et.AddressZero, markets: [market.address], });

        console.log(et.dumpObj(res));
    });


task("view:queryIRM")
    .addPositionalParam("market")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let market = await et.taskUtils.lookupToken(ctx, args.market);

        let res = await ctx.contracts.eulerGeneralView.doQueryIRM({ eulerContract: ctx.contracts.euler.address, underlying: market.address, });

        console.log(et.dumpObj(res));
    });
