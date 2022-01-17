const fs = require("fs");


task("batch:decodeTxData", "Decode hex tx call data")
    .addPositionalParam("hexDataFileName")
    .addPositionalParam("contractAddress", "e.g., exec contract proxy address on ropsten 0xF7B8611008Ed073Ef348FE130671688BBb20409d")
    .setAction(async ({ hexDataFileName, contractAddress }) => {
        const et = require("../test/lib/eTestLib");

        const ctx = await et.getTaskCtx();

        let data;
        try {
            data = fs.readFileSync(`${hexDataFileName}.txt`, 'utf8');
        } catch (e) {
            console.log('Error:', e.message);
        }

        const formatArg = (arg, decimals) => ethers.BigNumber.isBigNumber(arg)
            ? (arg.eq(et.MaxUint256) ? 'max_uint' : arg.toString() + (decimals ? ` (${ethers.utils.formatUnits(arg, decimals)} in token decimals)` : ''))
            : arg;

        if (contractAddress) {
            const decodeBatchTxData = async () => {
                const { fn, args, contractName, contract, symbol, decimals } = await ctx.decodeBatchItem(contractAddress, data.toString())

                console.log(`${contractName}.${fn.name} @ ${contract.address}`);
                if (symbol && decimals) {
                    console.log(`token symbol: ${symbol}, token decimal: ${decimals}`);
                }

                let batchItems;
                if (fn.name === 'batchDispatch') {
                    batchItems = await Promise.all(args[0]['data'].map(async ([allowError, proxy, data]) => ({
                        allowError,
                        proxy,
                        ...await ctx.decodeBatchItem(proxy, data)
                    })));


                    console.log(`\n  deferred liquidity for the following addresses:`, args[1]['data']);

                    batchItems.map((item, i) => {
                        console.log(`\n  ${i + 1}. ${item.symbol || item.contractName}.${item.fn.name} (allowError: ${String(item.allowError)}) @ ${item.proxy}`);
                        item.args.map(({ arg, data }) => console.log(`     ${arg.name}: ${formatArg(data, item.decimals)}`));
                    })
                }
            }
            await decodeBatchTxData();
        }
        
    });


task("batch:buildBatch")
    .addPositionalParam("batchFileName", "Batch items file name")
    .addOptionalParam("addrs", "Address array for defer liqidity checks")
    .addOptionalParam("impersonate", "Impersonate account on mainnet fork")
    .setAction(async ({ batchFileName, addrs, impersonate }) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        const batchItems = require(`../${batchFileName}`);
        const batch = ctx.buildBatch(batchItems);
        const addresses = addrs === undefined ? [] : addrs;
        const encodedBatchTxData = ctx.contracts.exec.interface.encodeFunctionData('batchDispatch', [batch, addresses]);

        console.log(encodedBatchTxData);

        if (impersonate == 'true') {
            if (network.name !== 'localhost') throw 'Only localhost!';

            // todo with localhost this fails
            const ctx = await et.getTaskCtx('mainnet');

            const govAdminAddress = await ctx.contracts.governance.getGovernorAdmin();
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [govAdminAddress],
            });

            console.log('\nExecuting governance action with governor admin...')

            await network.provider.send("hardhat_setBalance", [
                govAdminAddress,
                "0x56BC75E2D63100000", // top up signer with 100 Ether
            ]);

            // if the tx cannot be executed or will fail, 
            // e.g., if wallet is not governor admin for governance batch item, 
            // it will throw cannot estimate gas, tx may fail or require gas limit to be manually set
            await et.taskUtils.runTx(await ctx.contracts.exec.connect(govAdmin).batchDispatch(batch, addresses, await ctx.txOpts()));
        }
    });


task("defender:createProposal")
    .addPositionalParam("batchFileName", "Batch items file name")
    .addPositionalParam("title", "Proposal title in plain text")
    .addPositionalParam("multisig", "Multisig address")
    .addOptionalParam("addrs")
    .setAction(async (args) => {
        const { AdminClient } = require('defender-admin-client');
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        const addresses = args.addrs === undefined ? [] : args.addrs;

        const batchItems = require(`../${args.batchFileName}`);
        const batch = ctx.buildBatch(batchItems);

        for (item of batchItems) {
            if (item.contract == 'installer') {
                throw ("[ERROR]: cannot call installer module via defender admin api");
            }
        }

        let batchArray = [];
        for (item of batch) {
            let temp = [];
            temp.push(item.allowError);
            temp.push(item.proxyAddr);
            temp.push(item.data);
            batchArray.push(temp);
        }

        try {
            if (process.env.DEFENDER_API_KEY && process.env.DEFENDER_API_SECRET) {
                const client = new AdminClient({ apiKey: process.env.DEFENDER_API_KEY, apiSecret: process.env.DEFENDER_API_SECRET });
                await client.createProposal({
                    contract: { address: ctx.contracts.exec.address, network: 'ropsten' }, // Target contract
                    title: args.title, // Title of the proposal
                    description: args.title, // Description of the proposal
                    type: 'custom', // Use 'custom' for custom admin actions
                    functionInterface: { // Function interface/ABI
                        "name": "batchDispatch",
                        "inputs": [
                            {
                                "type": "tuple[]",
                                "name": "items",
                                "components": [{ "type": "bool", "name": "allowError" }, { "type": "address", "name": "proxyAddr" }, { "type": "bytes", "name": "data" }]
                            },
                            {
                                "type": "address[]",
                                "name": "deferLiquidityChecks"
                            }
                        ]
                    },
                    functionInputs: [
                        batchArray,
                        addresses
                    ], // Arguments to the function
                    via: args.multisig, // Multisig address for mainnet or ropsten = 0xD12b7f433e42b333D111033A374b780328eedfBD
                    viaType: 'Gnosis Safe', // Either Gnosis Safe or Gnosis Multisig
                });
            }

            console.log("Proposal created on OpenZeppelin Defender with the following data: \n", [batch, addresses]);
        } catch (e) {
            console.error(e.message);
        }
    });
