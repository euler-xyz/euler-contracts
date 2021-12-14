task("debug:sandbox", "Barebone task setup")
    .addOptionalParam("forkat", "Fork mainnet at the given block. Only localhost network")
    .addOptionalParam("impersonate", "Impersonate account on mainnet fork")
    .addFlag("isfork", "Run on localhost, which is already forked from mainnet")
    .setAction(async ({ forkat, isfork, impersonate }) => {
        const et = require("../test/lib/eTestLib");

        let ctx;
        if (forkat) await hre.run("debug:forkat", { forkat });
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

task("debug:upgrade-fork-modules", "Upgrade all modules to current code, assumably with debugging code")
    .setAction(async () => {
        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        const upgradeAdminAddress = await ctx.contracts.installer.getUpgradeAdmin();
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [upgradeAdminAddress],
        });
        const upgradeAdmin = await ethers.getSigner(upgradeAdminAddress);

        const newModules = {};
        const capitalize = string => string.startsWith('irm')
            ? string.slice(0, 3).toUpperCase() + string.slice(3)
            : string.charAt(0).toUpperCase() + string.slice(1);
        const gitCommit = '0x' + '1'.repeat(64);

        for (let module of Object.keys(ctx.contracts.modules)) {
            const args = [gitCommit];
            if (module === 'riskManager') args.push(ctx.tokenSetup.riskManagerSettings);
            if (module === 'swap') args.push(ctx.tokenSetup.existingContracts.swapRouter, ctx.tokenSetup.existingContracts.oneInch);

            if (!ctx.factories[capitalize(module)]) {
                console.log('skipping:', capitalize(module));
                continue;
            }
            console.log('deploying', capitalize(module));
            newModules[module] = await (await ctx.factories[capitalize(module)].deploy(...args)).deployed();
        }

        console.log('\nInstalling...')
        await ctx.contracts.installer.connect(upgradeAdmin).installModules(
            Object.values(newModules).map(m => m.address)
        );
})

task("debug:decode", "Decode tx call data")
    .addPositionalParam("hash", "Transaction hash")
    .setAction(async ({ hash, }) => {
        const et = require("../test/lib/eTestLib");
        const receipt = await ethers.provider.getTransaction(hash);
        const ctx = await et.getTaskCtx();

        const singleProxyModule = proxy => Object.entries(ctx.contracts).find(([, c]) => c.address === proxy) || [];

        const decodeBatchItem = async (proxy, data) => {
            let [name, contract] = singleProxyModule(proxy);
            
            if (!contract) {
                const moduleId = await ctx.contracts.exec.attach(proxy).moduleId();
                name = {500_000: 'EToken', 500_001: 'DToken'}[moduleId];
                if (!name) throw `Unrecognized moduleId! ${moduleId}`;

                contract = await ethers.getContractAt(name, proxy);
            }

            const fn = contract.interface.getFunction(data.slice(0, 10));
            const d = contract.interface.decodeFunctionData(data.slice(0, 10), data);
            const args = fn.inputs.map((arg, i) => ({ arg, data: d[i] }));

            const symbol = contract.symbol ? await contract.symbol() : '';
            const decimals = contract.decimals ? await contract.decimals() : '';

            return { fn, args, contractName: name, contract, symbol, decimals };
        }

        const tx = {};

        [tx.contractName, tx.contract] = singleProxyModule(receipt.to);
        if (!tx.contractName) throw `Unrecognized tx target ${receipt.to}`;

        tx.fn = tx.contract.interface.parseTransaction(receipt);

        if (tx.fn.name === 'batchDispatch') {
            tx.batchItems = await Promise.all(tx.fn.args.items.map(async ([allowError, proxy, data]) => ({ 
                allowError,
                proxy,
                ...await decodeBatchItem(proxy, data)
            })));
        }

        // log it
        const formatArg = (arg, decimals) => ethers.BigNumber.isBigNumber(arg)
            ? (arg.eq(et.MaxUint256) ? 'max_uint' : arg.toString() + (decimals ? ` (${ethers.utils.formatUnits(arg, decimals)} in token decimals)` : ''))
            : arg;

        console.log('from:', receipt.from);
        console.log(`${tx.contractName}.${tx.fn.name} @ ${tx.contract.address}`);
        if (tx.fn.name === 'batchDispatch') {
            console.log(`\n  deferred liquidity:`, tx.fn.args[1])
            tx.batchItems.map((item, i) => {
                console.log(`\n  ${i+1}. ${item.symbol || item.contractName}.${item.fn.name} (allowError: ${String(item.allowError)}) @ ${item.proxy}`);
                item.args.map(({ arg, data }) => console.log(`     ${arg.name}: ${formatArg(data, item.decimals)}`));
            })
        }

    });

task("debug:forkat", "Reset localhost network to mainnet fork at a given block")
    .addPositionalParam("forkat", "Fork mainnet at the given block. Only localhost network")
    .setAction(async ({ forkat }) => {
        if (network.name !== 'localhost') throw "forkat only on localhost network"

        const params = [
            {
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
                    blockNumber: Number(forkat),
                },
            },
        ];
        await network.provider.request({
            method: "hardhat_reset",
            params,
        });
});