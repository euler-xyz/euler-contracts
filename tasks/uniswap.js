const uniswapFactoryAbi = [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
    'function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)',
];

const uniswapPoolAbi = [
    'function initialize(uint160 sqrtPriceX96) external',
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function liquidity() external view returns (uint128)',
    'function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives)',
    'function increaseObservationCardinalityNext(uint16 observationCardinalityNext) external',
];

task("uniswap:create-pool")
    .addPositionalParam("token0")
    .addPositionalParam("token1")
    .addOptionalParam("fee", "fee", "3000")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let uniswapFactory = new ethers.Contract(ctx.tokenSetup.riskManagerSettings.uniswapFactory, uniswapFactoryAbi, ctx.wallet);

        let token0 = await et.taskUtils.lookupToken(ctx, args.token0);
        let token1 = await et.taskUtils.lookupToken(ctx, args.token1);
        let fee = parseInt(args.fee);

        let decimals0 = await token0.decimals();
        let decimals1 = await token1.decimals();

        let poolAddr = await uniswapFactory.getPool(token0.address, token1.address, fee);

        if (poolAddr === et.AddressZero) {
            console.log(`No such uniswap pool, creating now...`);
            await et.taskUtils.runTx(uniswapFactory.createPool(token0.address, token1.address, fee));
            poolAddr = await uniswapFactory.getPool(token0.address, token1.address, fee);
        }

        let pool = new ethers.Contract(poolAddr, uniswapPoolAbi, ctx.wallet);

        let slot0 = await pool.slot0();

        if (slot0.sqrtPriceX96.eq(0)) {
            console.log(`Uniswap pool not initialized, initializing now...`);

            let decimals0Exp = ethers.BigNumber.from(10).pow(decimals0);
            let decimals1Exp = ethers.BigNumber.from(10).pow(decimals1);

            let initialPrice;

            if (ethers.BigNumber.from(token1.address).lt(token0.address)) {
                initialPrice = et.ratioToSqrtPriceX96(decimals0Exp.mul(1500), decimals1Exp).toString(); // 1500:1
            } else {
                initialPrice = et.ratioToSqrtPriceX96(decimals1Exp, decimals0Exp.mul(1500)).toString(); // 1:1500
            }  

            await et.taskUtils.runTx(pool.initialize(initialPrice));
        }

        console.log(`Uniswap pool addr: ${pool.address}`);
    });

task("uniswap:read-twap")
    .addPositionalParam("token0")
    .addPositionalParam("token1")
    .addPositionalParam("fee")
    .addPositionalParam("twap")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let uniswapFactory = new ethers.Contract(ctx.tokenSetup.riskManagerSettings.uniswapFactory, uniswapFactoryAbi, ctx.wallet);

        let token0 = await et.taskUtils.lookupToken(ctx, args.token0);
        let token1 = await et.taskUtils.lookupToken(ctx, args.token1);
        let fee = parseInt(args.fee);
        let twap = parseInt(args.twap);

        let poolAddr = await uniswapFactory.getPool(token0.address, token1.address, fee);

        if (poolAddr === et.AddressZero) {
            throw(`No such uniswap pool`);
        }

        let pool = new ethers.Contract(poolAddr, uniswapPoolAbi, ctx.wallet);

        console.log(et.dumpObj(await pool.observe([twap, 0])));
    });

task("uniswap:read-pool-info")
    .addPositionalParam("token0")
    .addPositionalParam("token1")
    .addPositionalParam("fee")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let uniswapFactory = new ethers.Contract(ctx.tokenSetup.riskManagerSettings.uniswapFactory, uniswapFactoryAbi, ctx.wallet);

        let token0 = await et.taskUtils.lookupToken(ctx, args.token0);
        let token1 = await et.taskUtils.lookupToken(ctx, args.token1);
        let fee = parseInt(args.fee);

        let poolAddr = await uniswapFactory.getPool(token0.address, token1.address, fee);

        if (poolAddr === et.AddressZero) {
            throw(`No such uniswap pool`);
        }

        let pool = new ethers.Contract(poolAddr, uniswapPoolAbi, ctx.wallet);

        //console.log(et.dumpObj(await pool.observe([twap, 0])));

        let slot0 = await pool.slot0();
        console.log("observationCardinality: ", slot0.observationCardinality);
        console.log("observationCardinalityNext: ", slot0.observationCardinalityNext);

        let liquidity = await pool.liquidity();
        console.log("liquidity: ",liquidity.toString());
    });

task("uniswap:increase-observation-cardinality")
    .addPositionalParam("token0")
    .addPositionalParam("token1")
    .addPositionalParam("fee")
    .addPositionalParam("newCardinality")
    .setAction(async (args) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let uniswapFactory = new ethers.Contract(ctx.tokenSetup.riskManagerSettings.uniswapFactory, uniswapFactoryAbi, ctx.wallet);

        let token0 = await et.taskUtils.lookupToken(ctx, args.token0);
        let token1 = await et.taskUtils.lookupToken(ctx, args.token1);
        let fee = parseInt(args.fee);

        let poolAddr = await uniswapFactory.getPool(token0.address, token1.address, fee);

        if (poolAddr === et.AddressZero) {
            throw(`No such uniswap pool`);
        }

        let pool = new ethers.Contract(poolAddr, uniswapPoolAbi, ctx.wallet);

        await et.taskUtils.runTx(pool.increaseObservationCardinalityNext(parseInt(args.newCardinality), await ctx.txOpts()));
    });
