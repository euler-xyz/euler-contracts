const zksync = require("zksync-web3");
const ethers = require("ethers");

task("zkSync:withdraw")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        if (!(process.env.RPC_URL_GOERLI && process.env.RPC_URL_ZKSYNC_TESTNET))
            throw '\RPC_URL_GOERLI and RPC_URL_ZKSYNC_TESTNET environment variables both not found...\n';

        const et = require("../test/lib/eTestLib");

        const syncProvider = new zksync.Provider(process.env.RPC_URL_ZKSYNC_TESTNET);
        const ethProvider = ethers.getDefaultProvider(process.env.RPC_URL_GOERLI);

        const syncWallet = new zksync.Wallet(process.env.PRIVATE_KEY, syncProvider, ethProvider);

        // Retreiving the current (committed) balance of an account
        const committedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS);
        if (et.formatUnits(committedEthBalance, 18) < args.amount) throw 'Insufficient balance on L2 to perform withdrawal!'

        // Retrieving the balance of an account in the last finalized block zkSync.md#confirmations-and-finality
        const finalizedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS, "finalized");

        console.log('Committed Eth Balance', et.formatUnits(committedEthBalance, 18));
        console.log('Finalized Eth Balance', et.formatUnits(finalizedEthBalance, 18));

        const withdrawL2 = await syncWallet.withdraw({
            token: zksync.utils.ETH_ADDRESS,
            amount: et.eth(args.amount),
        });

        console.log(`Withdrawing ${args.amount} ETH from zkSync L2 back to L1`);

        // Assets will be withdrawn to the target wallet 
        // after the validity proof of the zkSync block with this transaction is generated and verified by the mainnet contract.
        // It is possible to wait until the validity proof verification is complete:
        // await withdrawL2.waitFinalize();
    });

task("zkSync:transfer")
    .addPositionalParam("recipient", "An L2 zkSync wallet address")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        if (!(process.env.RPC_URL_GOERLI && process.env.RPC_URL_ZKSYNC_TESTNET))
            throw '\RPC_URL_GOERLI and RPC_URL_ZKSYNC_TESTNET environment variables both not found...\n';
        
        const et = require("../test/lib/eTestLib");

        const syncProvider = new zksync.Provider(process.env.RPC_URL_ZKSYNC_TESTNET);
        const ethProvider = ethers.getDefaultProvider(process.env.RPC_URL_GOERLI);

        const syncWallet = new zksync.Wallet(process.env.PRIVATE_KEY, syncProvider, ethProvider);

        // Retreiving the current (committed) balance of an account
        let committedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS);
        if (et.formatUnits(committedEthBalance, 18) < args.amount) throw 'Insufficient balance on L2 to perform transfer!'

        const transfer = await syncWallet.transfer({
            to: args.recipient,
            token: zksync.utils.ETH_ADDRESS,
            amount: et.eth(args.amount),
        });

        console.log(`Transferring ${et.eth(args.amount)} ETH on L2 from ${syncWallet.address} to ${args.recipient}`);

        // Await commitment
        await transfer.wait();

        // Await finalization on L1
        await transfer.waitFinalize();

        // Retreiving the current (committed) balance of an account
        committedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS);

        // Retrieving the balance of an account in the last finalized block zkSync.md#confirmations-and-finality
        const finalizedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS, "finalized");

        console.log('Committed Eth Balance', et.formatUnits(committedEthBalance, 18));
        console.log('Finalized Eth Balance', et.formatUnits(finalizedEthBalance, 18));
    });

task("zkSync:deposit")
    .addPositionalParam("amount")
    .setAction(async (args) => {
        if (!(process.env.RPC_URL_GOERLI && process.env.RPC_URL_ZKSYNC_TESTNET))
            throw '\RPC_URL_GOERLI and RPC_URL_ZKSYNC_TESTNET environment variables both not found...\n';
        
        const et = require("../test/lib/eTestLib");

        const syncProvider = new zksync.Provider(process.env.RPC_URL_ZKSYNC_TESTNET);
        const ethProvider = ethers.getDefaultProvider(process.env.RPC_URL_GOERLI);

        const syncWallet = new zksync.Wallet(process.env.PRIVATE_KEY, syncProvider, ethProvider);

        const deposit = await syncWallet.deposit({
            token: zksync.utils.ETH_ADDRESS,
            amount: et.eth(args.amount),
        });

        console.log(`Depositing ${args.amount} ETH from L1 to zkSync L2`);

        // Await processing of the deposit on L1
        const tx = await deposit.waitL1Commit();

        // Await processing the deposit on zkSync
        const result = await deposit.wait();

        console.log(`Transaction: ${tx.transactionHash} (on ${ethProvider.network.name})`);

        console.log(`Mined. Status: ${result.status}`);

        // Retreiving the current (committed) balance of an account
        const committedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS);

        // Retrieving the balance of an account in the last finalized block zkSync.md#confirmations-and-finality
        const finalizedEthBalance = await syncWallet.getBalance(zksync.utils.ETH_ADDRESS, "finalized");

        console.log('Committed Eth Balance', et.formatUnits(committedEthBalance, 18));
        console.log('Finalized Eth Balance', et.formatUnits(finalizedEthBalance, 18));
    });
