const uniswapFactoryAbi = [
    'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
    'function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool)',
];

const uniswapPoolAbi = [
    'function initialize(uint160 sqrtPriceX96) external',
    'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    'function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory tickCumulatives, uint160[] memory liquidityCumulatives)',
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
            await et.taskUtils.runTx(pool.initialize("3068493539683605256287027819677")); // 1500:1
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
