const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

const eTestLib = require("../test/lib/eTestLib");


async function main() {
    const ctx = await eTestLib.deployContracts(ethers.provider, await ethers.getSigners(), 'staging');

    eTestLib.writeAddressManifestToFile(ctx, "./euler-addresses.json");

    // Supply tokens to test accounts

    for (let token of Object.keys(ctx.contracts.tokens)) {
        for (let addr of eTestLib.defaultTestAccounts) {
            await ctx.contracts.tokens[token].mint(addr, ethers.utils.parseEther("10000"));
        }
    }

    // Setting prices

    await ctx.updateUniswapPrice("DAI/WETH", "0.000562089");
    await ctx.updateUniswapPrice("USDC/WETH", "0.000555855");
    await ctx.updateUniswapPrice("BAT/WETH", "0.000472044");
    await ctx.updateUniswapPrice("LINK/WETH", "0.016419");
    await ctx.updateUniswapPrice("UNI/WETH", "0.0172596");
    await ctx.updateUniswapPrice("YFI/WETH", "20.3573");
    await ctx.updateUniswapPrice("COMP/WETH", "0.252798");
}

main();
