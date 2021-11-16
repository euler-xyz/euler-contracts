const axios = require('axios');

task("fork:deploy")
    .setAction(async () => {
        const et = require("../test/lib/eTestLib");
        const wallets = await ethers.getSigners();

        const ctx = await et.deployContracts(ethers.provider, wallets, 'fork');
        et.writeAddressManifestToFile(ctx, "./euler-addresses.json");
});



task("fork:balances")
    .addPositionalParam("address")
    .addVariadicPositionalParam("symbols", "token symbols to provide to the address")
    .addOptionalParam("amount", "default 1000")
    .setAction(async ({address, amount = 1000, symbols}) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        if (symbols) {
            const { data: tokenList } = await axios.get('https://raw.githubusercontent.com/euler-xyz/euler-tokenlist/master/euler-tokenlist.json');
            await Promise.all(symbols.map(async symbol => {
                const token = tokenList.tokens.find(t => t.symbol === symbol);
                if (!token) return console.log(symbol, 'not found')
                ctx.contracts.tokens[symbol] = await ethers.getContractAt('TestERC20', token.address);
            }));
        }

        console.log("You now own:")
        for (let sym of Object.keys(symbols)) {
            await ctx.setTokenBalanceInStorage(sym, address, amount);
            console.log(amount, sym)
        }

        await network.provider.send("hardhat_setBalance", [address, '0x21e19e0c9bab2400000'])
});
