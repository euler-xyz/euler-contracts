const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

const eTestLib = require("../test/lib/eTestLib");

async function main() {
    const ctx = await eTestLib.deployContracts(ethers.provider, await ethers.getSigners(), 'testing');

    eTestLib.writeAddressManifestToFile(ctx, "./euler-addresses.json");

    // Supply tokens to test account

    for (let token of Object.keys(ctx.contracts.tokens)) {
        await ctx.contracts.tokens[token].mint(ctx.wallet.address, ethers.utils.parseEther("10000"));
    }

    for (let addr of eTestLib.defaultTestAccounts) {
        await ctx.contracts.tokens.TST.mint(addr, ethers.utils.parseEther("1000"));
        await ctx.contracts.tokens.TST2.mint(addr, ethers.utils.parseEther("1000"));
    }

    // Setting prices

    await ctx.updateUniswapPrice("TST/WETH", "0.005882");
    await ctx.updateUniswapPrice("TST2/WETH", "0.000047411");
    await ctx.updateUniswapPrice("TST3/WETH", "6.9145811");
    await ctx.updateUniswapPrice("UTST/WETH", "0.019244");

    // Fast forward time so prices become active

    await ctx.increaseTime(31 * 60);
}

main();
