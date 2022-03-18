const seedrandom = require("seedrandom");


task("staging:setup")
    .setAction(async ({ args, }) => {

    await hre.run("compile");

    const et = require("../test/lib/eTestLib");
    const ctx = await et.deployContracts(ethers.provider, await ethers.getSigners(), 'staging');
    et.writeAddressManifestToFile(ctx, "./euler-addresses.json");


    let wallets = await ethers.getSigners();

    for (let sym of Object.keys(ctx.contracts.tokens)) {
        let decimals = await ctx.contracts.tokens[sym].decimals();

        for (let wallet of wallets) {
            await (await ctx.contracts.tokens[sym].connect(ctx.wallet).mint(wallet.address, ethers.utils.parseUnits("1000", decimals))).wait();

            if (wallet.address === wallets[0].address) continue; // first wallet reserved for price updates

            await (await ctx.contracts.tokens[sym].connect(wallet).approve(ctx.contracts.euler.address, et.MaxUint256)).wait();
        }

        {
            let wallet = wallets[0];

            await (await ctx.contracts.tokens[sym].connect(wallet).approve(ctx.contracts.simpleUniswapPeriphery.address, et.MaxUint256)).wait();

            if (sym !== 'WETH' && ctx.contracts.uniswapPools[`${sym}/WETH`]) {
                await (await ctx.contracts.simpleUniswapPeriphery.connect(wallet).mint(
                    ctx.contracts.uniswapPools[`${sym}/WETH`].address, wallet.address, -887220, 887220, et.units("1", decimals)
                )).wait();
            }
        }
    }
});


task("staging:users")
    .setAction(async ({ args, }) => {

    const et = require("../test/lib/eTestLib");
    const ctx = await et.getTaskCtx('staging');

    let rng = seedrandom('');

    let decimalsCache = {};

    let genAmount = async (sym) => {
        if (decimalsCache[sym] === undefined) {
            decimalsCache[sym] = await ctx.contracts.tokens[sym].decimals();
        }

        let amount = et.units('' + (Math.round(rng() * 1000) / 100), decimalsCache[sym]);
        let amountPretty = ethers.utils.formatUnits(amount, decimalsCache[sym]);

        return [amount, amountPretty];
    };

    let wallets = await ethers.getSigners();
    let tokens = Object.keys(ctx.contracts.tokens);

    let alreadyEnteredMarkets = {};

    while (1) {
        let op = Math.floor(rng() * 4);

        let tokenId = Math.floor(rng() * tokens.length);
        let sym = tokens[tokenId];

        let [amount, amountPretty] = await genAmount(sym);

        let walletId = Math.floor(rng() * wallets.length);
        let wallet = wallets[walletId];

        let opts = {};

        try {
            if (op === 0) {
                if (!alreadyEnteredMarkets[`${walletId}_${tokenId}`]) {
                    verboseLog(`[${walletId}] enterMarket ${sym}`);
                    await (await ctx.contracts.markets.connect(wallet).enterMarket(0, ctx.contracts.tokens[sym].address)).wait();
                    alreadyEnteredMarkets[`${walletId}_${tokenId}`] = true;
                }
                verboseLog(`[${walletId}] deposit ${amountPretty} ${sym}`);
                await (await ctx.contracts.eTokens['e' + sym].connect(wallet).deposit(0, amount, opts)).wait();
            } else if (op === 1) {
                verboseLog(`[${walletId}] withdraw ${amountPretty} ${sym}`);
                await (await ctx.contracts.eTokens['e' + sym].connect(wallet).withdraw(0, amount, opts)).wait();
            } else if (op === 2) {
                verboseLog(`[${walletId}] borrow ${amountPretty} ${sym}`);
                await (await ctx.contracts.dTokens['d' + sym].connect(wallet).borrow(0, amount, opts)).wait();
            } else if (op === 3) {
                verboseLog(`[${walletId}] repay ${amountPretty} ${sym}`);
                await (await ctx.contracts.dTokens['d' + sym].connect(wallet).repay(0, amount, opts)).wait();
            }
        } catch (e) {
            console.error(e.message);
        }

        await timer(1000);
    }
});


task("staging:prices")
    .setAction(async ({ args, }) => {

    const et = require("../test/lib/eTestLib");
    const ctx = await et.getTaskCtx('staging');

    let rng = seedrandom(process.env.SEED || '');

    let wallets = await ethers.getSigners();
    let tokens = Object.keys(ctx.contracts.tokens).filter(sym => sym !== 'WETH' && sym !== 'EUL');

    while (1) {
        let tokenId = Math.floor(rng() * tokens.length);
        let sym = tokens[tokenId];
        let decimals = await ctx.contracts.tokens[sym].decimals();

        const variance = 0.05;

        let mode = rng() > 0.5 ? 'buy' : 'sell';
        let priceLimit;

        let curr = await ctx.contracts.exec.callStatic.getPriceFull(ctx.contracts.tokens[sym].address);
        let currPrice = parseInt(curr.currPrice.div(1e9).toString()) / 1e9;

        let delta = rng() * variance;

        if (mode === 'buy') {
            priceLimit = currPrice * (1 + delta);
        } else {
            priceLimit = currPrice * (1 - delta);
        }

        priceLimit = priceLimit.toFixed(3);

        verboseLog(`${sym} ${mode} ${currPrice.toString()} -> ${priceLimit}`);

        try {
            await ctx.doUniswapSwap(wallets[0], sym, mode, et.units("10", decimals), priceLimit);
        } catch (e) {
            console.error(e.message);
        }

        await timer(1000);
    }
});


task("staging:stakes")
    .setAction(async ({ args, }) => {

    const et = require("../test/lib/eTestLib");
    const ctx = await et.getTaskCtx('staging');

    let rng = seedrandom(process.env.SEED || '');

    let wallets = await ethers.getSigners();
    let tokens = Object.keys(ctx.contracts.tokens);

    await (await ctx.contracts.tokens.EUL.mint(wallets[0].address, et.units(1, 36))).wait();
    await (await ctx.contracts.tokens.EUL.approve(ctx.contracts.eulStakes.address, et.MaxUint256)).wait();

    for (let tok of tokens) {
        let amount = Math.floor(rng() * 10);

        console.log(`STAKE ${amount} on ${tok}`);

        let tx = await ctx.contracts.eulStakes.stake([{
            underlying: ctx.contracts.tokens[tok].address,
            amount: et.eth(amount),
        }]);

        await tx.wait();
    }
});



task("staging:mining-testcase")
    .setAction(async ({ args, }) => {

    const et = require("../test/lib/eTestLib");
    const ctx = await et.getTaskCtx('staging');

    await (await ctx.contracts.tokens.EUL.mint(ctx.wallet.address, et.units(1, 36))).wait();
    await (await ctx.contracts.tokens.EUL.approve(ctx.contracts.eulStakes.address, et.MaxUint256)).wait();

    // Populate pool with tokens to be borrowed
    for (let sym of ['WETH', 'USDC', 'DAI']) {
        await (await ctx.contracts.tokens[sym].mint(ctx.contracts.euler.address, et.eth(1000000))).wait();
    }

    // Deposit collateral for borrowing
    for (let w of ['wallet', 'wallet2', 'wallet3']) {
        console.log(`${w} -> ${ctx[w].address}`);
        w = ctx[w];
        await (await ctx.contracts.tokens.WETH.mint(w.address, et.eth(1000))).wait();
        await (await ctx.contracts.tokens.WETH.connect(w).approve(ctx.contracts.euler.address, et.MaxUint256)).wait();
        await (await ctx.contracts.eTokens.eWETH.connect(w).deposit(0, et.eth(1000))).wait();
        await (await ctx.contracts.markets.connect(w).enterMarket(0, ctx.contracts.tokens.WETH.address)).wait();
    }

    let stake = async (spec) => {
        for (let s of spec) {
            console.log(`STAKE: ${s[0]} + ${s[1]}   ${ctx.contracts.tokens[s[0]].address}`);
        }

        let tx = await ctx.contracts.eulStakes.stake(spec.map(s => { return {
            underlying: ctx.contracts.tokens[s[0]].address,
            amount: et.eth(s[1]),
        }}));

        await tx.wait();
    };

    let borrow = async (w, sym, amount) => {
        await (await ctx.contracts.dTokens.dWETH.connect(w).borrow(0, amount)).wait();
    };

    let repay = async (w, sym, amount) => {
        await (await ctx.contracts.dTokens.dWETH.connect(w).repay(0, amount)).wait();
    };

    await stake([
        ['USDC', 200],
        ['WETH', 50],
        ['DAI', 20],
    ]);

    await borrow(ctx.wallet, 'WETH', et.eth(10));

    await ctx.fastForwardToBlock(600);

    await borrow(ctx.wallet2, 'WETH', et.eth(10));

    await ctx.fastForwardToBlock(600+150);

    await repay(ctx.wallet2, 'WETH', et.MaxUint256);

    await ctx.fastForwardToBlock(600+200);

    await borrow(ctx.wallet2, 'WETH', et.eth(10));

    await ctx.fastForwardToBlock(600+301);

    await repay(ctx.wallet2, 'WETH', et.MaxUint256);

    await ctx.fastForwardToBlock(1010);
});



function verboseLog(msg) {
    console.log(`# ${msg}`);
}

function timer(ms) {
    return new Promise(res => setTimeout(res, ms));
}
