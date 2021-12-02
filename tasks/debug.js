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
            ? arg.toString() + (decimals ? ` (${ethers.utils.formatUnits(arg, decimals)} in token decimals)` : '')
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
