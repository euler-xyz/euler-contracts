const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

const eTestLib = require("../test/lib/eTestLib");


// Usage: NEWGOVADDR=0x... npx hardhat run --network localhost scripts/set-gov-admin.js

async function main() {
    const ctx = await eTestLib.getScriptCtx('staging');

    // Default ctx.wallet is the installAdmin

    ctx.contracts.installer.setGovernorAdmin(process.env.NEWGOVADDR);
}

main();
