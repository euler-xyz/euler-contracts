const EthDater = require('ethereum-block-by-date');

task("debug:sandbox", "Barebone task setup")
    .addOptionalParam("forkat", "Fork mainnet at the given block. Only localhost network")
    .addOptionalParam("impersonate", "Impersonate account on mainnet fork")
    .addFlag("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async ({ forkat, isfork, impersonate }) => {
        const et = require("../test/lib/eTestLib");

        let ctx;
        if (forkat) await hre.run("debug:fork", { block: forkat });
        if (forkat || isfork || impersonate) ctx = await et.getTaskCtx('mainnet')
        else ctx = await et.getTaskCtx();

        let signer;
        if (impersonate) {
            await network.provider.request({
                method: "hardhat_impersonateAccount",
                params: [impersonate],
            });
            signer = await ethers.getSigner(impersonate);
        }
        let snapshot;
        if (forkat || isfork || impersonate) {
            snapshot = await network.provider.request({
                method: 'evm_snapshot',
                params: [],
            });
        }


        // your code here


        // await network.provider.request({
        //     method: 'evm_revert',
        //     params: [snapshot],
        // });
        if (impersonate) {
            await network.provider.request({
                method: "hardhat_stopImpersonatingAccount",
                params: [impersonate],
            });
        }
});

task("debug:swap-contracts", "Replace contract code for all euler contracts on mainnet fork")
    .setAction(async () => {
        if (network.name !== 'localhost') throw 'Only localhost!';

        await hre.run("compile");

        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx('mainnet');

        const capitalize = string => string.startsWith('irm')
            ? 'IRM' + string.slice(3)
            : string.charAt(0).toUpperCase() + string.slice(1);
        const stringifyArgs = args => args.map(a =>JSON.stringify(a));

        const gitCommit = '0x' + '1'.repeat(64);

        console.log('swapping', 'Euler');
        await hre.run('debug:set-code', {
            compile: false,
            name: 'Euler',
            address: ctx.addressManifest.euler,
            args: stringifyArgs([ethers.constants.AddressZero, ethers.constants.AddressZero]),
        })

        console.log('swapping', 'EulerGeneralView');
        await hre.run('debug:set-code', {
            compile: false,
            name: 'EulerGeneralView',
            address: ctx.addressManifest.eulerGeneralView,
            args: stringifyArgs([gitCommit]),
        })

        console.log('swapping', 'FlashLoan');
        await hre.run('debug:set-code', {
            compile: false,
            name: 'FlashLoan',
            address: ctx.addressManifest.flashLoan,
            args: stringifyArgs([ctx.addressManifest.euler, ctx.addressManifest.exec, ctx.addressManifest.markets]),
        })

        for (const [module, address] of Object.entries(ctx.addressManifest.modules)) {
            const args = [gitCommit];
            if (module === 'riskManager') args.push(ctx.tokenSetup.riskManagerSettings);
            if (module === 'swap') args.push(ctx.tokenSetup.existingContracts.swapRouter, ctx.tokenSetup.existingContracts.oneInch);

            console.log('swapping', capitalize(module));
            await hre.run('debug:set-code', {
                compile: false,
                name: capitalize(module),
                address,
                args: stringifyArgs(args),
            })
        }
})

task("debug:decode", "Decode tx call data")
    .addPositionalParam("hash", "Transaction hash")
    .setAction(async ({ hash, }) => {
        const et = require("../test/lib/eTestLib");
        const transaction = await ethers.provider.getTransaction(hash);
        const receipt = await ethers.provider.getTransactionReceipt(hash);

        const ctx = await et.getTaskCtx();

        const tx = await ctx.getContract(transaction.to);
        if (!tx.contractName) throw `Unrecognized tx target ${transaction.to}`;
        tx.fn = tx.contract.interface.parseTransaction(transaction);

        if (tx.fn.name === 'batchDispatch') {
            tx.batchItems = await Promise.all(tx.fn.args.items.map(async ([allowError, proxy, data]) => ({ 
                allowError,
                proxy,
                ...await ctx.decodeBatchItem(proxy, data),
            })));
        }

        tx.logs = await Promise.all(receipt.logs.map(async log => {
            const { contract, contractName } = await ctx.getContract(log.address);
            if (!contract) {
                return {
                    contractName: 'External',
                    log: log,
                };
            }

            return {
                decimals: contract.decimals ? await contract.decimals() : '',
                symbol: contract.symbol ? await contract.symbol() : '',
                contractName,
                log: contract.interface.parseLog(log),
            };
        }));

        // log it
        const formatArg = (arg, decimals) => ethers.BigNumber.isBigNumber(arg)
            ? (arg.eq(et.MaxUint256) ? 'max_uint' : arg.toString() + (decimals ? ` (${ethers.utils.formatUnits(arg, decimals)} in token decimals)` : ''))
            : arg;

        console.log('from:', transaction.from);
        console.log(`${tx.contractName}.${tx.fn.name} @ ${tx.contract.address}`);
        if (tx.fn.name === 'batchDispatch') {
            console.log(`\n  deferred liquidity:`, tx.fn.args[1])
            tx.batchItems.map((item, i) => {
                console.log(`\n  ${i+1}. ${item.symbol || item.contractName}.${item.fn.name} (allowError: ${String(item.allowError)}) @ ${item.proxy}`);
                item.args.map(({ arg, data }) => console.log(`     ${arg.name}: ${formatArg(data, item.decimals)}`));
            })
        }

        console.log('\nLOGS')

        tx.logs.forEach(({ contractName, log, decimals, symbol }) => {
            if (contractName === 'External') {
                console.log(`\nExtrenal contract ${log.address}`);
                console.group();
                console.log(log);
                console.groupEnd();
                return;
            }
            console.log(`\n${contractName !== 'euler' ? `${symbol}.` : ''}${log.name}`);
            console.group();
            Object.entries(log.args)
                .filter(([key]) => isNaN(key))
                .forEach(([key, val]) => console.log(`${key}: ${formatArg(val, decimals)}`));
            console.groupEnd();

        })

    });

task("debug:fork", "Reset localhost network to mainnet fork at a given block or time")
    .addOptionalParam("block", "Fork mainnet at the given block")
    .addOptionalParam("time", "Fork mainnet at the latest block before given time (ISO 8601 / RFC 2822, e.g. 2021-12-28T14:06:40Z)")
    .setAction(async ({ block, time }) => {
        if (network.name !== 'localhost') throw "forkat only on localhost network";
        if (block && time) throw 'Block and time params can\'t be used simultaneously';
        if (!(block || time)) throw 'Block or time param must be provided';
        if (!process.env.RPC_URL_MAINNET) throw 'env variable RPC_URL_MAINNET not found';

        if (time) {
            const mainnetProvider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_MAINNET);
            const dater = new EthDater(mainnetProvider);
            let timestamp;
            ({ block, timestamp } = await dater.getDate(time, false));
            block -= 1;
            console.log('Found block: ', block, 'timestamp:', timestamp);
        }

        const params = [
            {
                forking: {
                    jsonRpcUrl: process.env.RPC_URL_MAINNET,
                    blockNumber: Number(block),
                },
            },
        ];
        await network.provider.request({
            method: "hardhat_reset",
            params,
        });
});

task("debug:set-code", "Set contract code at a given address")
    .addOptionalParam("name", "Contract name")
    .addParam("address", "Contract address")
    .addOptionalVariadicPositionalParam("args", "Constructor args")
    .addFlag("compile", "Compile contracts before swapping the code")
    .addOptionalParam("artifacts", "Path to artifacts file which contains the init bytecode")
    .setAction(async ({ name, address, args = [], compile, artifacts}) => {
        if (network.name !== 'localhost') throw 'Only on localhost network!';
        if (name && artifacts) throw 'Name and artifacts params can\'t be used simultaneously';
        if (!(name || artifacts)) throw 'Name or artifacts param must be provided';

        if (compile) await hre.run("compile");

        const snapshot = await network.provider.request({
            method: 'evm_snapshot',
            params: [],
        });
        let factory;

        if (name) {
            factory = await ethers.getContractFactory(name);
        } else {
            const signers = await ethers.getSigners();
            factory = ethers.ContractFactory
                        .fromSolidity(require(artifacts))
                        .connect(signers[0]);
        }
        args = args.map(a => {
            try { return JSON.parse(a) }
            catch { return a }
        });

        const tmpContract = await (await factory.deploy(...args)).deployed();
        const deployedBytecode = await network.provider.request({
            method: 'eth_getCode',
            params: [tmpContract.address, 'latest'],
        });

        await network.provider.request({
            method: 'evm_revert',
            params: [snapshot],
        });

        await network.provider.request({
            method: 'hardhat_setCode',
            params: [address, deployedBytecode],
        });
});

task("debug:decode-eulerscan-export", "Converts encoded stdin to decoded stdout")
    .setAction(async () => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx('mainnet');

        const readline = require('readline');

        let rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          terminal: false
        });

        for await (let line of rl) {
            line = JSON.parse(line);
            if (line.table !== "Log") continue;

            let dec = ctx.contracts.euler.interface.parseLog(line.origJson);
            dec = et.cleanupObj({ name: dec.name, args: dec.args, });

            dec.transactionHash = line.origJson.transactionHash;
            dec.transactionIndex = parseInt(line.origJson.transactionIndex, 16);
            dec.logIndex = parseInt(line.origJson.logIndex, 16);
            dec.blockHash = line.origJson.blockHash;
            dec.blockNumber = parseInt(line.origJson.blockNumber, 16);

            console.log(JSON.stringify(dec));
        }
});
