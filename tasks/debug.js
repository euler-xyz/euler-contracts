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

        // const UNISWAP_QUOTERV2_ADDRESS = '0x0209c4Dc18B2A1439fD2427E34E7cF3c6B91cFB9'
        // const abi = [
        //     'function quoteExactInputSingle(tuple(address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) public returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
        //   ]
        // const quoterContract = new ethers.Contract(
        //     UNISWAP_QUOTERV2_ADDRESS,
        //     abi,
        //     ethers.provider,
        // );
        // const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
        // const renDoge = '0x3832d2f059e55934220881f831be501d180671a7'
        // const amountIn = 1
        // console.log('amountIn: ', amountIn);
        // const fee = 10000

        // let quote = await quoterContract.callStatic.quoteExactInputSingle({
        //     tokenIn: renDoge,
        //     tokenOut: WETH_ADDRESS,
        //     fee,
        //     amountIn,
        //     sqrtPriceLimitX96: 0
        //   });
        // your code here

        await ctx.contracts.installer.getUpgradeAdmin()
        await ctx.contracts.eulerGeneralView.doQuery({eulerContract: ctx.contracts.euler.address, account: ethers.constants.AddressZero, markets: []})


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
        await hre.run("compile");

        const et = require("../test/lib/eTestLib");

        if (network.name !== 'localhost') throw 'Only localhost!';

        const ctx = await et.getTaskCtx('mainnet');

        const capitalize = string => string.startsWith('irm')
            ? string.slice(0, 3).toUpperCase() + string.slice(3)
            : string.charAt(0).toUpperCase() + string.slice(1);
        const stringifyArgs = args => args.map(a =>JSON.stringify(a));

        const gitCommit = '0x' + '1'.repeat(64);

        console.log('swapping', 'Euler');
        await hre.run('debug:set-code', {
            compile: false,
            name: 'Euler',
            address: ctx.contracts.euler.address,
            args: stringifyArgs([ethers.constants.AddressZero, ethers.constants.AddressZero]),
        })

        console.log('swapping', 'EulerGeneralView');
        await hre.run('debug:set-code', {
            compile: false,
            name: 'EulerGeneralView',
            address: ctx.contracts.eulerGeneralView.address,
            args: stringifyArgs([gitCommit]),
        })

        for (let module of Object.keys(ctx.contracts.modules)) {
            const args = [gitCommit];
            if (module === 'riskManager') args.push(ctx.tokenSetup.riskManagerSettings);
            if (module === 'swap') args.push(ctx.tokenSetup.existingContracts.swapRouter, ctx.tokenSetup.existingContracts.oneInch);

            if (!ctx.factories[capitalize(module)]) {
                console.log('skipping:', capitalize(module));
                continue;
            }
            console.log('swapping', capitalize(module));
            await hre.run('debug:set-code', {
                compile: false,
                name: capitalize(module),
                address: ctx.contracts.modules[module].address,
                args: stringifyArgs(args),
            })
        }
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

task("debug:forkat", "Reset localhost network to mainnet fork at a given block")
    .addPositionalParam("forkat", "Fork mainnet at the given block. Only localhost network")
    .setAction(async ({ forkat }) => {
        if (network.name !== 'localhost') throw "forkat only on localhost network";

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

task("debug:set-code", "Set contract code at a given address")
    .addOptionalParam("name", "Contract name")
    .addParam("address", "Contract address")
    .addOptionalVariadicPositionalParam("args", "Constructor args")
    .addFlag("compile", "Compile contracts before swapping the code")
    .addOptionalParam("artifacts", "Path to artifacts file which contains the init bytecode")
    .setAction(async ({ name, address, args, compile, artifacts}) => {
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