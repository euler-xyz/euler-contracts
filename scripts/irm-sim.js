const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");
const seedrandom = require("seedrandom");

const et = require("../test/lib/eTestLib");


// ITERS=200 IRM=IRM_REACTIVE_V1 npx hardhat run scripts/irm-sim.js > run.dat
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

    await ctx.updateUniswapPrice("TST/WETH", "100");
    await ctx.updateUniswapPrice("TST2/WETH", "100");

    // Fast forward time so prices become active

    await ctx.checkpointTime();
    await ctx.jumpTime(31 * 60);
    await ctx.mineEmptyBlock();
    let startTime = (await ctx.provider.getBlock()).timestamp;

    // Variables 
    let marketAPR = 0.0;
    let marketAPRBias = 0.505; // If > 0.5, then external APR tends to increase, otherwise it decreases - flip happens at boundary

    let poolSize;
    let totalBorrows;
    let interestRate;

    let utilisation;
    let borrowAPR;

    // Parameters
    const txPerDay = 30;
    const minMarketAPR = 0.01;
    const maxMarketAPR = 0.4 + minMarketAPR;
    const marketChangeRate = 0.005;
    const arbitrageSensitivity = 100; // Do transactions happen at random or do users arbitrage the extneral APY?
    const withdrawVsBorrowBias = 0.4; // When Market APR > Euler APR, do suppliers leave or do borrowers onboard? 
    const depositVsRepayBias = 0.6; // When Market APR < Euler APR, do suppliers emerge or do borrowers repay?
    const averageTradeSize = 1; // Around 1% of the max supply available

    // Seed random number generator
    let rng = seedrandom('');

    let currIter = 0;
    let numIters = process.env.ITERS ? parseInt(process.env.ITERS) : Infinity;

    console.log(`Time, Total supply, Total borrows, Utilisation, Euler Borrow APR, Market Borrow APR`);
    while(currIter++ < numIters) {
        let sleepTimeSeconds = Math.floor(2 * rng() * 86400 / txPerDay);
        sleepTimeSeconds = sleepTimeSeconds < 2 ? 2 : sleepTimeSeconds
        verboseLog(`sleeping ${sleepTimeSeconds}s`);
        await ctx.jumpTime(sleepTimeSeconds);
        await ctx.mineEmptyBlock();

        let now = (await ctx.provider.getBlock()).timestamp;
      
        // Simulate as biased random walk between min and max - switch bias when boundary is hit
        if(rng() < marketAPRBias) {
            marketAPR = marketAPR + 2 * rng() * marketChangeRate;
            if(marketAPR > maxMarketAPR) {
                marketAPR = maxMarketAPR - rng() / 100;
                marketAPRBias = 1 - marketAPRBias;
            }
        } else {
            marketAPR = marketAPR - 2 * rng() * marketChangeRate;
            if(marketAPR < minMarketAPR) {
                marketAPR = rng() / 100 + minMarketAPR;
                marketAPRBias = 1 - marketAPRBias;
            }
        }

        // Operation selected uniformly at random
        let op = Math.floor(rng() * 4);        

        // Upside down Gaussian function - the further the borrow APR gets from the external market APR, the more sensitive lenders/borrowers become and start to arbitrage       
        let sensitivity = 1 - 1 * Math.exp(-Math.pow(marketAPR - borrowAPR, 2) / 2 * Math.pow(arbitrageSensitivity, 2));
        
        if(currIter == 1) { // Deposit
            op = 0;
        } else if (rng() < sensitivity) { // Operation selected with some tendency towards arbitrage
            if(marketAPR > borrowAPR) { // Withdraw and supply elsewhere or borrow cheaper than the market
                if (rng() < withdrawVsBorrowBias) {
                    op = 1; // withdraw
                    if(poolSize && ethers.utils.formatEther(poolSize.add(totalBorrows)) < 20) { // assume there is a stronghold of suppliers that never withdraw giving a min supply
                        op = 2;
                    }
                } else {
                    op = 2; // borrow
                }
            } else { // Deposit to earn more interest or repay and borrow elsewhere
                if (rng() < depositVsRepayBias) {
                    op = 0; // deposit
                    if(poolSize && ethers.utils.formatEther(poolSize.add(totalBorrows)) > 100) { // assume there is a maximum amount of supply available
                        op = 3; // repay
                    }
                } else {
                    op = 3; // repay
                }
            }
        } 
        
        let randAmount = 0.01 - Math.log(rng()) * averageTradeSize; // Sample from exponential distribution with mean averageTradeSize        
        let amount = et.eth(randAmount);        
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

        poolSize = await ctx.contracts.tokens.TST.balanceOf(ctx.contracts.euler.address);
        totalBorrows = await ctx.contracts.dTokens.dTST.totalSupply();
        interestRate = await ctx.contracts.markets.interestRate(ctx.contracts.tokens.TST.address);

        utilisation = ethers.utils.formatEther(totalBorrows.eq(0) ? et.eth(0) : totalBorrows.mul(et.c1e18).div(poolSize.add(totalBorrows)));        
        borrowAPR = interestRate.mul(86400*365).mul(1000000).div(et.c1e27).toNumber() / 1000000;

        verboseLog(`${now - startTime} ${ethers.utils.formatEther(poolSize)} ${ethers.utils.formatEther(totalBorrows)} ${utilisation} => ${interestRate} ${borrowAPR}`);
        console.log(`${now - startTime}, ${ethers.utils.formatEther(poolSize.add(totalBorrows))}, ${ethers.utils.formatEther(totalBorrows)}, ${utilisation}, ${borrowAPR}, ${marketAPR}`);
    }
}

function verboseLog(msg) {
    if (process.env.VERBOSE) console.log(`# ${msg}`);
}

main();
