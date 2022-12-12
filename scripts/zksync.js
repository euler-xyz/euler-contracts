// const hre = require("hardhat");
// const { utils, Wallet } = require("zksync-web3");
// const ethers = require("ethers");
// const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");

const zksync = require("zksync-web3");
const ethers = require("ethers");


// usage: npx hardhat run deploy/zksync.js --network hardhat
async function main() {
    // Currently, only one environment is supported.
    const syncProvider = new zksync.Provider("https://zksync2-testnet.zksync.dev");
    const ethProvider = ethers.getDefaultProvider(process.env.RPC_URL_GOERLI);
    // Derive zksync.Wallet from ethereum private key.
    // zkSync's wallets support all of the methods of ethers' wallets.
    // Also, both providers are optional and can be connected to later via `connect` and `connectToL1`.
    const syncWallet = new zksync.Wallet(process.env.PRIVATE_KEY, syncProvider, ethProvider);

    const deposit = await syncWallet.deposit({
        token: zksync.utils.ETH_ADDRESS,
        amount: ethers.utils.parseEther("0.0001"),
    })

    // Await processing of the deposit on L1
    const ethereumTxReceipt = await deposit.waitL1Commit();

    // Await processing the deposit on zkSync
    const depositReceipt = await deposit.wait();

    // Retreiving the current (committed) balance of an account
    const committedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS);

    // Retrieving the balance of an account in the last finalized block zkSync.md#confirmations-and-finality
    const finalizedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS, "finalized");

    console.log('committedEthBalance', ethers.utils.formatEther(committedEthBalance));
    console.log('finalizedEthBalance', ethers.utils.formatEther(finalizedEthBalance));

}


main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
