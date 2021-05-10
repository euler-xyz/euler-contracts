const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const seedrandom = require("seedrandom");

const et = require("../test/lib/eTestLib");


// ITERS=200 IRM=IRM_LINEAR npx hardhat run scripts/irm-sim.js > run.dat
// in gnuplot:
//   plot 'run.dat' using 1:2 with lines, 'run.dat' using 1:3 with lines


async function main() {
    const ctx = await et.deployContracts(ethers.provider, await ethers.getSigners(), 'testing');

    if (process.env.IRM) {
        let irmModuleId = ctx.moduleIds[process.env.IRM];
        if (!irmModuleId) throw(Error(`no such IRM: ${process.env.IRM}`));
        await ctx.setIRM(ctx.contracts.tokens.TST.address, irmModuleId, Buffer.from(""));
    }

    // Initial balances

    for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
        await ctx.contracts.tokens.TST.mint(from.address, ethers.utils.parseEther("10000"));
        await ctx.contracts.tokens.TST2.mint(from.address, ethers.utils.parseEther("10000"));

        await ctx.contracts.tokens.TST.connect(from).approve(ctx.contracts.euler.address, et.MaxUint256);
        await ctx.contracts.tokens.TST2.connect(from).approve(ctx.contracts.euler.address, et.MaxUint256);

        await ctx.contracts.markets.connect(from).enterMarket(0, ctx.contracts.tokens.TST.address);
        await ctx.contracts.markets.connect(from).enterMarket(0, ctx.contracts.tokens.TST2.address);
    }

    // Collateral

    await (await ctx.contracts.eTokens.eTST2.connect(ctx.wallet2).deposit(0, et.eth(10000))).wait();

    // Setting prices

    await ctx.updateUniswapPrice("TST/WETH", "31.2");
    await ctx.updateUniswapPrice("TST2/WETH", "0.77");

    // Fast forward time so prices become active

    await ctx.checkpointTime();
    await ctx.jumpTime(31 * 60);
    await ctx.mineEmptyBlock();
    let startTime = (await ctx.provider.getBlock()).timestamp;


    let rng = seedrandom('');

    let genAmount = () => {
        return et.eth('' + (Math.round(rng() * 1000) / 100));
    };


    let currIter = 0;
    let numIters = process.env.ITERS ? parseInt(process.env.ITERS) : Infinity;

    while(currIter++ < numIters) {
        let sleepTimeSeconds = Math.floor(rng() * 86400);
        verboseLog(`sleeping ${sleepTimeSeconds}s`);
        await ctx.jumpTime(sleepTimeSeconds);
        await ctx.mineEmptyBlock();

        let now = (await ctx.provider.getBlock()).timestamp;

        let op = Math.floor(rng() * 4);
        let amount = genAmount();
        let amountPretty = ethers.utils.formatEther(amount);

        let opts = {};

        try {
            if (op === 0) {
                verboseLog(`deposit ${amountPretty}`);
                await (await ctx.contracts.eTokens.eTST.connect(ctx.wallet).deposit(0, amount, opts)).wait();
            } else if (op === 1) {
                verboseLog(`withdraw ${amountPretty}`);
                await (await ctx.contracts.eTokens.eTST.connect(ctx.wallet).withdraw(0, amount, opts)).wait();
            } else if (op === 2) {
                verboseLog(`borrow ${amountPretty}`);
                await (await ctx.contracts.dTokens.dTST.connect(ctx.wallet2).borrow(0, amount, opts)).wait();
            } else if (op === 3) {
                verboseLog(`repay ${amountPretty}`);
                await (await ctx.contracts.dTokens.dTST.connect(ctx.wallet2).repay(0, amount, opts)).wait();
            }
        } catch (e) {
            console.error(e.message);
        }


        if (process.env.INVARIANTS) {
            let markets = ['TST', 'TST2'].map(m => ctx.contracts.tokens[m].address);
            let accounts = [ctx.wallet.address, ctx.wallet2.address];

            let result = await ctx.contracts.invariantChecker.check(ctx.contracts.euler.address, markets, accounts, !!process.env.VERBOSE);
        }


        let poolSize = await ctx.contracts.tokens.TST.balanceOf(ctx.contracts.euler.address);
        let totalBorrows = await ctx.contracts.dTokens.dTST.totalSupply();
        let interestRate = await ctx.contracts.markets.interestRate(ctx.contracts.tokens.TST.address);

        let utilisation = totalBorrows.eq(0) ? et.eth(0) : totalBorrows.mul(et.c1e18).div(poolSize.add(totalBorrows));
        let borrowAPR = interestRate.mul(86400*365).mul(1000000).div(et.c1e27).toNumber() / 1000000;

        verboseLog(`${now - startTime} ${ethers.utils.formatEther(poolSize)} ${ethers.utils.formatEther(totalBorrows)} ${ethers.utils.formatEther(utilisation)} => ${interestRate} ${borrowAPR}`);
        console.log(`${now - startTime} ${ethers.utils.formatEther(utilisation)} ${borrowAPR}`);
    }
}

function verboseLog(msg) {
    if (process.env.VERBOSE) console.log(`# ${msg}`);
}

main();
