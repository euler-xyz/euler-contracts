const { utils, Wallet } = require("zksync-web3");
const ethers = require("ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");

// withdraw 
// transfer eth

task("zkSync:deposit")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        const wallet = new Wallet(`0x${process.env.PRIVATE_KEY}`);
        const deployer = new Deployer(hre, wallet);
        
        const amount = ethers.utils.parseEther(args.amount);
        const deposit = await deployer.zkWallet.deposit({
            to: deployer.zkWallet.address,
            token: utils.ETH_ADDRESS,
            amount: amount,
        });
        
        // Await processing the deposit on zkSync
        // const depositReceipt = await deposit.wait();

        // // Wallet balance on L2
        // console.log(`Recipient balance on zkSync after deposit ${ethers.utils.formatEther(await deployer.zkWallet.getBalance(zksync.utils.ETH_ADDRESS))}`);
    });
