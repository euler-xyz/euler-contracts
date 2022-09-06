task("liquidate:check")
    .addPositionalParam("violator")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let detLiq = await ctx.contracts.exec.callStatic.detailedLiquidity(args.violator);

        let markets = [];

        let totalLiabilities = ethers.BigNumber.from(0);
        let totalAssets = ethers.BigNumber.from(0);

        for (let asset of detLiq) {
            let addr = asset.underlying.toLowerCase();
            let token = await ethers.getContractAt('IERC20', addr);
            let decimals = await token.decimals();
            let sym = await token.symbol();

            let eToken = await underlyingToEtoken(ctx, addr);

            totalLiabilities = totalLiabilities.add(asset.status.liabilityValue);
            totalAssets = totalAssets.add(asset.status.collateralValue);

            markets.push({ addr, sym, decimals, eToken, status: asset.status, });
        };

        let underlyings = markets.filter(m => !m.status.liabilityValue.eq(0));
        let collaterals = markets.filter(m => !m.status.collateralValue.eq(0));

        let health = totalAssets.mul(et.c1e18).div(totalLiabilities);

        console.log(`Account ${args.violator} health = ${ethers.utils.formatEther(health)}`);

        if (health.gte(et.c1e18)) {
            console.log(`  Account not in violation.`);
            return;
        }


        let attemptLiq = async (underlying, collateral) => {
            //console.log(`Repay ${underlying.sym} for collateral ${collateral.sym}`);
            let simulateBatch = async (batchItems, deferredAccounts) => {
                // make sure the tx as a whole doesn't revert, e.g. due to collateral violation
                await ctx.contracts.exec.callStatic.batchDispatch(
                    ctx.buildBatch(batchItems),
                    deferredAccounts,
                );
                try {
                    await ctx.contracts.exec.callStatic.batchDispatchSimulate(
                        ctx.buildBatch(batchItems),
                        deferredAccounts,
                    );
                } catch (e) {
                    if (e.errorName !== 'BatchDispatchSimulation') throw e;
                    return e.errorArgs.simulation;
                }
                throw new Error('batchDispatchSimulate did not throw');
            }

            let checkLiq = await ctx.contracts.liquidation.callStatic.checkLiquidation(ctx.wallet.address, args.violator, underlying.addr, collateral.addr);

            if (checkLiq.repay.eq(0)) return undefined;

            let repayFraction = 98;
            let batchItems;
            let batchResponse;
            let repay;

            while (repayFraction > 2) {
                //console.log("  RepayFraction ",repayFraction);
                repay = checkLiq.repay.mul(repayFraction).div(100);

                batchItems = [
                    {
                        contract: collateral.eToken,
                        method: 'balanceOfUnderlying',
                        args: [
                            ctx.wallet.address,
                        ],
                    },
                    ...buildLiqBatch(ctx, args.violator, underlying, collateral, repay),
                    {
                        contract: 'exec',
                        method: 'getPriceFull',
                        args: [
                            collateral.addr,
                        ],
                    },
                    {
                        contract: collateral.eToken,
                        method: 'balanceOfUnderlying',
                        args: [
                            ctx.wallet.address,
                        ],
                    },
                ];

                try {
                    batchResponse = await simulateBatch(batchItems, [ctx.wallet.address])
                    break;
                } catch(e) {
                    //console.log(e.error);
                }

                repayFraction = Math.floor(repayFraction / 2);
            }

            if (!batchResponse) return undefined;

            let decoded = await ctx.decodeBatch(batchItems, batchResponse);

            let balanceBefore = decoded[0][0];
            let balanceAfter = decoded[decoded.length - 1][0];

            if (balanceAfter.lte(balanceBefore)) return undefined; // Had a balance and it went down, so this is not profitable

            let yield = balanceAfter.sub(balanceBefore);

            let yieldEth = yield
                            .mul(ethers.BigNumber.from(10).pow(18 - collateral.decimals))
                            .mul(decoded[decoded.length - 2].currPrice).div(et.c1e18);

            return {
                underlying,
                collateral,
                repay,
                repayFraction,
                yield,
                yieldEth,
            };
        };


        let liqOps = [];
        let counter = 1;

        for (let u of underlyings) {
            for (let c of collaterals) {
                console.log(`Testing combination ${counter}/${underlyings.length * collaterals.length}`);
                counter++;
                let op = await attemptLiq(u, c);
                if (op) liqOps.push(op);
            }
        }

        liqOps.sort((a,b) => a.yieldEth.lt(b.yieldEth) ? 1 : -1);

        console.log("\nLiquidation opportunities:");

        for (let l of liqOps) {
            console.log();
            console.log(`Repay ${l.underlying.sym} for ${l.collateral.sym}, ${l.repayFraction}%`);
            console.log(`    Repay: ${ethers.utils.formatEther(l.repay)} ${l.underlying.sym}`);
            console.log(`    Yield: ${ethers.utils.formatUnits(l.yield, l.collateral.decimals)} ${l.collateral.sym} = ${ethers.utils.formatEther(l.yieldEth)} ETH`);
            console.log(`    ${args.violator} ${l.underlying.addr} ${l.collateral.addr} ${l.repayFraction}`);
        }
    });



task("liquidate:execute")
    .addPositionalParam("violator")
    .addPositionalParam("underlying")
    .addPositionalParam("collateral")
    .addPositionalParam("repayFraction")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let underlying = {
            addr: args.underlying,
            eToken: await underlyingToEtoken(ctx, args.underlying),
        };

        let collateral = {
            addr: args.collateral,
            eToken: await underlyingToEtoken(ctx, args.collateral),
        };

        let checkLiq = await ctx.contracts.liquidation.callStatic.checkLiquidation(ctx.wallet.address, args.violator, underlying.addr, collateral.addr);

        if (checkLiq.repay.eq(0)) {
            console.error(`Repay returned 0, no liquidation opportunity`);
            return;
        }

        let repay = checkLiq.repay.mul(parseInt(args.repayFraction)).div(100);

        let batchItems = buildLiqBatch(ctx, args.violator, underlying, collateral, repay);

        await et.taskUtils.runTx(await ctx.contracts.exec.batchDispatch(ctx.buildBatch(batchItems), [ctx.wallet.address], await ctx.txOpts()));
    });



function buildLiqBatch(ctx, violator, underlying, collateral, repay) {
    let underlyingAddr = underlying.addr;
    let collateralAddr = collateral.addr;

    let refAsset = ctx.tokenSetup.riskManagerSettings.referenceAsset.toLowerCase();

    let conversionItem;

    if (underlyingAddr === collateralAddr) {
        conversionItem = {
            contract: underlying.eToken,
            method: 'burn',
            args: [
                0,
                ethers.constants.MaxUint256,
            ],
        };
    } else {
        let swapPath;

        if (underlyingAddr === refAsset || collateralAddr === refAsset) {
            swapPath = encodePath([underlyingAddr, collateralAddr], [3000]);
        } else {
            swapPath = encodePath([underlyingAddr, refAsset, collateralAddr], [3000, 3000]);
        }
        
        conversionItem = {
            contract: 'swap',
            method: 'swapAndRepayUni',
            args: [
                {
                    subAccountIdIn: 0,
                    subAccountIdOut: 0,
                    amountOut: 0,
                    amountInMaximum: ethers.constants.MaxUint256,
                    deadline: 0, // FIXME!
                    path: swapPath,
                },
                0,
            ],
        };
    }

    return [
        {
            contract: 'liquidation',
            method: 'liquidate',
            args: [
                violator,
                underlyingAddr,
                collateralAddr,
                repay,
                0,
            ],
        },
        conversionItem,
        {
            contract: 'markets',
            method: 'exitMarket',
            args: [
                0,
                underlyingAddr,
            ],
        },
    ];
}


async function underlyingToEtoken(ctx, addr) {
    let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(addr);
    return await ethers.getContractAt('EToken', eTokenAddr);
}

// From uniswap SDK?
function encodePath(path, fees) {
    const FEE_SIZE = 3

    if (path.length != fees.length + 1) {
        throw new Error('path/fee lengths do not match')
    }

    let encoded = '0x'
    for (let i = 0; i < fees.length; i++) {
    // 20 byte encoding of the address
    encoded += path[i].slice(2)
    // 3 byte encoding of the fee
    encoded += fees[i].toString(16).padStart(2 * FEE_SIZE, '0')
    }
    // encode the final token
    encoded += path[path.length - 1].slice(2)

    return encoded.toLowerCase()
}
