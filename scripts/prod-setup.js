const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs");

const eTestLib = require("../test/lib/eTestLib");


async function main() {
    let networkName = process.env.NETWORK_NAME;

    const ctx = await eTestLib.deployContracts(ethers.provider, await ethers.getSigners(), networkName);

    eTestLib.writeAddressManifestToFile(ctx, `./euler-addresses-${networkName}.json`);
}

main();
