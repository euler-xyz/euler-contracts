const hre = require("hardhat");
const ethers = hre.ethers;

async function main() {
    const signers = await ethers.getSigners();
    // We get the contract to deploy
    const Faucet = await ethers.getContractFactory("TestERC20TokenFaucet");
    const mint_threshold = 10;
    const faucet = await Faucet.deploy(mint_threshold);
    await faucet.deployed();

    console.log("Faucet deployed to:", faucet.address);

    /* let TestERC20 = await ethers.getContractFactory("TestERC20");
    let erc20 = await TestERC20.deploy("test erc20", "test erc20", 18, true);

    await erc20.deployed();

    let token = await TestERC20.attach(erc20.address);
    let tokenDecimals = await token.decimals()
    let amount = ethers.BigNumber.from(10).pow(tokenDecimals).mul(1000000000000)

    let tx = await token.mint(signers[0].address, amount);
    console.log(`Mint Transaction: ${tx.hash} (on ${hre.network.name})`);
    result = await tx.wait();
    console.log(`Mined. Status: ${result.status}`);

    let estimation = await token.estimateGas.transfer(faucet.address, amount);
    let gasPrice = 10e11; // 1000 Gwei
    let gasLimit = Math.floor(estimation * 1.01 + 1000);
    tx = await token.transfer(faucet.address, amount, { gasPrice: gasPrice, gasLimit: gasLimit });
    console.log(`Transfer Transaction: ${tx.hash} (on ${hre.network.name})`);
    result = await tx.wait();
    console.log(`Mined. Status: ${result.status}`);

    tx = await faucet.withdraw(token.address);
    console.log(`Withdraw Transaction: ${tx.hash} (on ${hre.network.name})`);
    result = await tx.wait();
    console.log(`Mined. Status: ${result.status}`); */
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });