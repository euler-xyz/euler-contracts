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
}

main();
