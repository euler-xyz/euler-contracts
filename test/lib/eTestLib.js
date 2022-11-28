require("@nomiclabs/hardhat-waffle");

const { expect, assert, } = require("chai");
const { loadFixture, } = waffle;

const fs = require("fs");
const util = require("util");
const child_process = require("child_process");

const { Route, Pool, FeeAmount, TICK_SPACINGS, encodeRouteToPath, nearestUsableTick, TickMath } = require('@uniswap/v3-sdk');
const { Token, CurrencyAmount } = require('@uniswap/sdk-core');
const JSBI = require('jsbi')

const { ratioToSqrtPriceX96, sqrtPriceX96ToPrice, } = require("./sqrtPriceUtils.js");
const { verifyBatch } = require("./deployLib");

Error.stackTraceLimit = 10000;
let conf;



const moduleIds = {
    // Public single-proxy modules
    INSTALLER: 1,
    MARKETS: 2,
    LIQUIDATION: 3,
    GOVERNANCE: 4,
    EXEC: 5,
    SWAP: 6,
    SWAP_HUB: 7,

    // Public multi-proxy modules
    ETOKEN: 500000,
    DTOKEN: 500001,

    // Internal modules
    RISK_MANAGER: 1000000,

    IRM_DEFAULT: 2000000,
    IRM_ZERO: 2000001,
    IRM_FIXED: 2000002,
    IRM_LINEAR: 2000100,
    IRM_CLASS_LIDO: 2000504,
};



const contractNames = [
    // Core

    'Euler',

    // Modules

    'Installer',
    'Markets',
    'Liquidation',
    'Governance',
    'Exec',
    'Swap',
    'SwapHub',
    'EToken',
    'DToken',

    // Internal modules

    'RiskManager',
    'IRMDefault',
    'IRMZero',
    'IRMFixed',
    'IRMLinear',
    'IRMClassLido',

    // Adaptors

    'FlashLoan',

    // Liquidity Mining

    'EulStakes',
    'EulDistributor',

    // Swap Handlers
    'SwapHandlerUniswapV3',
    'SwapHandler1Inch',
    'SwapHandlerUniAutoRouter',

    // Testing

    'TestERC20',
    'MockUniswapV3Factory',
    'EulerGeneralView',
    'InvariantChecker',
    'FlashLoanNativeTest',
    'FlashLoanAdaptorTest',
    'SimpleUniswapPeriphery',
    'TestModule',
    'MockAggregatorProxy',
    'MockStETH',

    // Custom Oracles

    'ChainlinkBasedOracle',
    'WSTETHOracle',
    'WBTCOracle',

    // View

    'EulerSimpleLens',
];



// Mnemonic: test test test test test test test test test test test junk

const defaultTestAccounts = [
    '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
    '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
    '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc',
    '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
    '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65',
    '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc',
    '0x976ea74026e726554db657fa54763abd0c3a0aa9',
    '0x14dc79964da2c08b23698b3d3cc7ca32193d9955',
    '0x23618e81e3f5cdf7f54c3d65f7fbc0abf5b21e8f',
    '0xa0ee7a142d267c1f36714e4a8f75612f20a79720',
];


const defaultUniswapFee = FeeAmount.MEDIUM;

let snapshot;



async function buildContext(provider, wallets, tokenSetupName) {
    let ctx = {
        moduleIds,

        provider,
        wallet: wallets[0],
        wallet2: wallets[1],
        wallet3: wallets[2],
        wallet4: wallets[3],
        wallet5: wallets[4],

        contracts: {
            tokens: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
            modules: {},
            swapHandlers: {}
        },

        uniswapPoolsInverted: {},

        stash: {}, // temp storage during testing
    };

    // Token Setup
    ctx.tokenSetup = require(`./token-setups/${tokenSetupName}`);

    ctx.activateMarket = async (tok) => {
        let result = await (await ctx.contracts.markets.activateMarket(ctx.contracts.tokens[tok].address)).wait();
        if (process.env.GAS) console.log(`GAS(activateMarket) : ${result.gasUsed}`);

        let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens[tok].address);
        ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

        let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
        ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
    };

    ctx.populateUniswapPool = async (pair, fee) => {
        const addr = await ctx.contracts.uniswapV3Factory.getPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, fee);

        ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
        ctx.contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

        let inverted = ethers.BigNumber.from(ctx.contracts.tokens[pair[0]].address).gt(ctx.contracts.tokens[pair[1]].address);
        ctx.uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = !inverted;
        ctx.uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = inverted;
    };

    ctx.createUniswapPool = async (pair, fee) => {
        await (await ctx.contracts.uniswapV3Factory.createPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, fee)).wait();
        return ctx.populateUniswapPool(pair, fee);
    }

    // Contract factories

    ctx.factories = {};

    for (let c of contractNames) {
        ctx.factories[c] = await ethers.getContractFactory(c);
    }


    // Time routines

    ctx.lastBlockTimestamp = async () => {
        return (await provider.getBlock()).timestamp;
    };

    ctx.startTime = await ctx.lastBlockTimestamp();
    ctx.lastCheckpointTime = ctx.startTime;

    ctx.checkpointTime = async () => {
        ctx.lastCheckpointTime = await ctx.lastBlockTimestamp();
    };

    ctx.jumpTime = async (offset) => {
        // Only works on hardhat EVM
        ctx.lastCheckpointTime += offset;
        await provider.send("evm_setNextBlockTimestamp", [ctx.lastCheckpointTime]);
    };

    ctx.mineEmptyBlock = async () => {
        await provider.send("evm_mine");
    };

    ctx.fastForwardToBlock = async (targetBlock) => {
        let curr = await provider.getBlockNumber();
        if (curr > targetBlock) throw(`can't fast forward to block ${targetBlock}, already on ${curr}`);
        while (curr < targetBlock) {
            await ctx.mineEmptyBlock();
            curr++;
        }
    };

    ctx.increaseTime = async (offset) => {
        await provider.send("evm_increaseTime", [offset]);
    };

    ctx.snapshot = async () => {
        ctx.lastSnapshotId = await provider.send('evm_snapshot', []);
        await ctx.checkpointTime();
    };

    ctx.revert = async () => {
        await provider.send('evm_revert', [ctx.lastSnapshotId]);
        await ctx.checkpointTime();
    };

    ctx.encodeUniswapPath = async (poolSymbols, inTokenSymbol, outTokenSymbol, exactOutput = false) => {
        let tokens = {};
        let pools = await Promise.all(poolSymbols.map(async ps => {
            let [ t0s, t1s ] = ps.split('/');
            let t0 = new Token(1, ctx.contracts.tokens[t0s].address, await ctx.contracts.tokens[t0s].decimals(), t0s, 'token0');
            let t1 = new Token(1, ctx.contracts.tokens[t1s].address, await ctx.contracts.tokens[t1s].decimals(), t1s, 'token1');
            tokens[t0s] = t0;
            tokens[t1s] = t1;

            return new Pool(t0, t1, defaultUniswapFee, ratioToSqrtPriceX96(1, 1), 0, 0, []);
        }));

        let route = new Route(pools, tokens[inTokenSymbol], tokens[outTokenSymbol]);
        return encodeRouteToPath(route, exactOutput);
    }

    ctx.getUniswapInOutAmounts = async (amount, poolSymbols, liquidity, sqrtPriceX96 = ratioToSqrtPriceX96(1, 1), zeroForOne) => {
        let [ t0s, t1s ] = poolSymbols.split('/');
        let t0 = new Token(1, ctx.contracts.tokens[t0s].address, await ctx.contracts.tokens[t0s].decimals(), t0s, 'token0');
        let t1 = new Token(1, ctx.contracts.tokens[t1s].address, await ctx.contracts.tokens[t1s].decimals(), t1s, 'token1');
        if(ctx.contracts.tokens[t0s].address.toLowerCase() > ctx.contracts.tokens[t1s].address.toLowerCase())
            [t0, t1] = [t1, t0];

        let pool = new Pool(t0, t1, FeeAmount.MEDIUM, sqrtPriceX96, liquidity, TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString())), [
            {
                index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidityNet: liquidity,
                liquidityGross: liquidity,
            },
            {
                index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[FeeAmount.MEDIUM]),
                liquidityNet: liquidity.mul(-1),
                liquidityGross: liquidity,
            }
        ]);
        let [outAmount] = await pool.getOutputAmount(CurrencyAmount.fromRawAmount(zeroForOne ? t1 : t0, amount))
        let [inAmount] = await pool.getInputAmount(CurrencyAmount.fromRawAmount(zeroForOne ? t1 : t0, amount))
        return {
            output: ethers.BigNumber.from(outAmount.quotient.toString()),
            input: ethers.BigNumber.from(inAmount.quotient.toString()),
        }
    }

    // Price updates

    ctx.poolAdjustedRatioToSqrtPriceX96 = (pool, a, b) => 
        ctx.uniswapPoolsInverted[pool] ? ratioToSqrtPriceX96(a, b) : ratioToSqrtPriceX96(b, a);

    ctx.setStorageAt = (address, slot, val) => 
        network.provider.send("hardhat_setStorageAt", [address, slot, val]);
    
    ctx.tokenBalancesSlot = async (token) => {
        if (!ctx.tokenBalancesSlot) ctx.tokenBalancesSlot = {};
        if (ctx.tokenBalancesSlot[token] !== undefined) return ctx.tokenBalancesSlot[token];

        let address = ctx.contracts.tokens[token].address;
        let val = '0x' + '12345'.padStart(64, '0');
        let account = module.exports.AddressZero;

        for (let i = 0; i < 100; i++) {
            let slot = ethers.utils.keccak256(module.exports.abiEncode(['address', 'uint'], [account, i]));

            // FIXME: The following hack is due to an issue in hardhat. The getStorageAt function uses the rpcStorageSlot
            // validator, which accepts prefixed 0s and requires the output to be exactly 66 characters. However,
            // the setStorageAt function uses the rpcQuantity validator which doesn't allow prefixed 0s, but
            // is relaxed on the exact length. To solve this, we use two different representations for the slot,
            // one for reading and one for writing.

            let slotStripped = '0x' + slot.substr(2).replace(/^0+/, '');

            let prev = await network.provider.send('eth_getStorageAt', [address, slot, 'latest']);
            await ctx.setStorageAt(address, slotStripped, val);
            let balance = await ctx.contracts.tokens[token].balanceOf(account);
            await ctx.setStorageAt(address, slotStripped, prev);

            if (balance.eq(ethers.BigNumber.from(val))) {
                ctx.tokenBalancesSlot[token] = i;
                return i;
            }
        }

        throw 'balances slot not found!';
    }

    ctx.setTokenBalanceInStorage = async (token, account, amount, balancesSlot) => {
        if (balancesSlot === undefined) balancesSlot = await ctx.tokenBalancesSlot(token);

        return ctx.setStorageAt(
            ctx.contracts.tokens[token].address,
            ethers.utils.keccak256(module.exports.abiEncode(['address', 'uint'], [account, balancesSlot])),
            '0x' + module.exports.units(amount, await ctx.contracts.tokens[token].decimals())
                .toHexString()
                .slice(2)
                .padStart(64, '0'),
        );
    }

    ctx.updateUniswapPrice = async (pair, price) => {
        let decimals = await ctx.contracts.tokens[pair.split('/')[0]].decimals();

        let a = ethers.utils.parseEther('1');
        let b = typeof(price) === 'string' ? ethers.utils.parseEther(price).mul(ethers.BigNumber.from(10).pow(18 - decimals)) : price;
        let poolContract = ctx.contracts.uniswapPools[pair];
        if (!poolContract) throw(Error(`Unknown pair: ${pair}`));

        if (ctx.uniswapPoolsInverted[pair]) [a, b] = [b, a];

        let sqrtPriceX96 = ratioToSqrtPriceX96(a, b);

        await (await poolContract.mockSetTwap(sqrtPriceX96)).wait();
    };

    ctx.doUniswapSwap = async (from, tok, dir, amount, priceLimit) => {
        let buy = dir === 'buy';
        let priceLimitRatio;

        if (ethers.BigNumber.from(ctx.contracts.tokens.WETH.address).gt(ctx.contracts.tokens[tok].address)) {
            buy = !buy;
            priceLimitRatio = ratioToSqrtPriceX96(priceLimit, 1);
        } else {
            priceLimitRatio = ratioToSqrtPriceX96(1, priceLimit);
        }

        if (buy) {
            let tx = await ctx.contracts.simpleUniswapPeriphery.connect(from).swapExact0For1(ctx.contracts.uniswapPools[`${tok}/WETH`].address, amount, from.address, priceLimitRatio);
            await tx.wait();
        } else {
            let tx = await ctx.contracts.simpleUniswapPeriphery.connect(from).swapExact1For0(ctx.contracts.uniswapPools[`${tok}/WETH`].address, amount, from.address, priceLimitRatio);
            await tx.wait();
        }
    };

    // Governance methods

    ctx.setIRM = async (underlying, irm, resetParams) => {
        await (await ctx.contracts.governance.connect(ctx.wallet).setIRM(underlying, irm, resetParams)).wait();
    };

    ctx.setReserveFee = async (underlying, newReserveFee) => {
        await (await ctx.contracts.governance.connect(ctx.wallet).setReserveFee(underlying, newReserveFee)).wait();
    };

    ctx.setAssetConfig = async (underlying, newConfig) => {
        let config = await ctx.contracts.markets.underlyingToAssetConfigUnresolved(underlying);

        config = {
            eTokenAddress: config.eTokenAddress,
            borrowIsolated: config.borrowIsolated,
            collateralFactor: config.collateralFactor,
            borrowFactor: config.borrowFactor,
            twapWindow: config.twapWindow,
        };

        if (newConfig.collateralFactor !== undefined) config.collateralFactor = Math.floor(newConfig.collateralFactor * 4000000000);
        if (newConfig.borrowFactor !== undefined) config.borrowFactor = Math.floor(newConfig.borrowFactor * 4000000000);
        if (newConfig.borrowIsolated !== undefined) config.borrowIsolated = newConfig.borrowIsolated;
        if (newConfig.twapWindow !== undefined) config.twapWindow = newConfig.twapWindow;

        if (newConfig.borrowFactor === 'default') newConfig.borrowFactor = 4294967295;
        if (newConfig.twapWindow === 'default') newConfig.twapWindow = 16777215;

        await (await ctx.contracts.governance.connect(ctx.wallet).setAssetConfig(underlying, config)).wait();
    };

    // Batch transactions

    ctx._batchItemToContract = (item) => {
        let contract;

        if (typeof(item.contract) === 'string') {
            let components = item.contract.split('.');
            contract = ctx.contracts;
            while (components.length > 0) contract = contract[components.shift()];
        } else {
            contract = item.contract;
        }

        return contract;
    };

    ctx.buildBatch = (items) => {
        return items.map(item => {
            let o = {};

            let contract = ctx._batchItemToContract(item);

            o.allowError = items.allowError === undefined ? false : items.allowError;
            o.proxyAddr = contract.address;
            o.data = contract.interface.encodeFunctionData(item.method, item.args);

            return o;
        });
    };

    ctx.decodeBatch = async (items, resp) => {
        let o = [];

        for (let i = 0; i < resp.length; i++) {
            o.push(ctx._batchItemToContract(items[i]).interface.decodeFunctionResult(items[i].method, resp[i].result));
        }

        return o;
    };

    // Transaction opts

    ctx.txOpts = async () => {
        let opts = {};

        if (process.env.TX_FEE_MUL !== undefined) {
            let feeMul = parseFloat(process.env.TX_FEE_MUL);

            let feeData = await ctx.provider.getFeeData();

            opts.maxFeePerGas = ethers.BigNumber.from(Math.floor(feeData.maxFeePerGas.toNumber() * feeMul));
            opts.maxPriorityFeePerGas = ethers.BigNumber.from(Math.floor(feeData.maxPriorityFeePerGas.toNumber() * feeMul));
        }

        if (process.env.TX_NONCE !== undefined) {
            opts.nonce = parseInt(process.env.TX_NONCE);
        }

        if (process.env.TX_GAS_LIMIT !== undefined) {
            opts.gasLimit = parseInt(process.env.TX_GAS_LIMIT);
        }

        return opts;
    };

    ctx.signPermit = async (tokenAddress, signer, permitType, domain, spender, valueOrAllowed, deadline) => {
        const typesPermit = {
            "Permit": [{
                "name": "owner",
                "type": "address"
                },
                {
                  "name": "spender",
                  "type": "address"
                },
                {
                  "name": "value",
                  "type": "uint256"
                },
                {
                  "name": "nonce",
                  "type": "uint256"
                },
                {
                  "name": "deadline",
                  "type": "uint256"
                }
              ],
        };
        const typesPermitAllowed = {
            "Permit": [{
                "name": "holder",
                "type": "address"
                },
                {
                  "name": "spender",
                  "type": "address"
                },
                {
                  "name": "nonce",
                  "type": "uint256"
                },
                {
                  "name": "expiry",
                  "type": "uint256"
                },
                {
                  "name": "allowed",
                  "type": "bool"
                }
              ],
        };

        const signTypedData = signer._signTypedData
            ? signer._signTypedData.bind(signer)
            : signer.signTypedData.bind(signer);

        const contract = new ethers.Contract(
            tokenAddress,
            ['function nonces(address owner) external view returns (uint)'],
            signer
        );

        const nonce = await contract.nonces(signer.address);

        if (permitType === 'EIP2612' || permitType === 'Packed') {
            const rawSignature = await signTypedData(domain, typesPermit, {
                owner: signer.address,
                spender,
                value: valueOrAllowed,
                nonce,
                deadline,
            });

            return {
                nonce,
                rawSignature,
                signature: ethers.utils.splitSignature(rawSignature)
            };
        }

        if (permitType === 'Allowed') {
            const allowed = Boolean(valueOrAllowed);
            const rawSignature = await signTypedData(domain, typesPermitAllowed, {
                holder: signer.address,
                spender,
                nonce,
                expiry: deadline,
                allowed,
            });

            return {
                nonce,
                rawSignature,
                signature: ethers.utils.splitSignature(rawSignature)
            };
        }

        throw new Error('Unknown permit type');
    }

    ctx.getContract = async (proxy) => {
        const cache = {};
        if (!cache[proxy]) {
            let [contractName, contract] = Object.entries(ctx.contracts)
                                            .find(([, c]) => c.address === proxy) || [];

            if (!contract) {
                let moduleId
                try {
                    moduleId = await ctx.contracts.exec.attach(proxy).moduleId();
                } catch {
                    return {};
                }
                contractName = {500_000: 'EToken', 500_001: 'DToken'}[moduleId];
                if (!contractName) throw `Unrecognized moduleId! ${moduleId}`;

                contract = await ethers.getContractAt(contractName, proxy);
            }
            cache[proxy] = {contract, contractName};
        }
        return cache[proxy];
    }

    ctx.decodeBatchItem = async (proxy, data) => {
        const { contract, contractName } = await ctx.getContract(proxy);
        if (!contract) throw `Unrecognized contract at ${proxy}`

        const fn = contract.interface.getFunction(data.slice(0, 10));
        const d = contract.interface.decodeFunctionData(data.slice(0, 10), data);
        const args = fn.inputs.map((arg, i) => ({ arg, data: d[i] }));

        const symbol = contract.symbol ? await contract.symbol() : '';
        const decimals = contract.decimals ? await contract.decimals() : '';

        return { fn, args, contractName, contract, symbol, decimals };
    }

    return ctx;
}



async function buildFixture(provider, tokenSetupName, forkAtBlock) {
    let params = [];
    if (forkAtBlock) {
        if(process.env.VERBOSE) console.log('forkAtBlock: ', forkAtBlock);
        params = [
            {
                forking: {
                    jsonRpcUrl: `https://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
                    blockNumber: forkAtBlock,
                },
            },
        ];
    } 
    if(!process.env.COVERAGE) {
        await network.provider.request({
            method: "hardhat_reset",
            params,
        });
    } else {
        if (snapshot) {
            await network.provider.request({
                method: 'evm_revert',
                params: [snapshot],
            });
        }
        snapshot = await network.provider.request({
            method: 'evm_snapshot',
            params: [],
        });
    }

    let wallets = await ethers.getSigners();

    let addressManifest;

    {
        let ctx = await deployContracts(provider, wallets, tokenSetupName);

        addressManifest = exportAddressManifest(ctx);
    }

    if (process.env.VERBOSE) { 
        console.log(addressManifest);
        console.log(wallets.slice(0, 6).map((w, i) => `wallet${i}: ${w.address}`));
    }

    let ctx = await loadContracts(provider, wallets, tokenSetupName, addressManifest);

    return ctx;
}

function fixtureFactory(fixture, forkAtBlock) {
    // new function returned on purpose to force rebuild
    return (_, provider) => buildFixture(provider, fixture, forkAtBlock);
}

function linearIRM(totalBorrows, poolSize) {
    let et = module.exports;
    let total = et.eth(totalBorrows).add(et.eth(poolSize));
    if (total.eq(0)) return total;
    let utilisation = et.eth(totalBorrows).mul(et.c1e18.mul(2**32 - 1)).div(total).div(et.c1e18);
    return et.units('0.000000003168873850681143096', 27).mul(utilisation).div(2**32 - 1);
}


function exportAddressManifest(ctx) {
    let output = {
        tokens: {},
        modules: {},
        swapHandlers: {},
    };

    for (let name of Object.keys(ctx.contracts)) {
        if (ctx.contracts[name].address) output[name] = ctx.contracts[name].address;
    }

    for (let token of Object.keys(ctx.contracts.tokens)) {
        output.tokens[token] = ctx.contracts.tokens[token].address;
    }

    for (let moduleName of Object.keys(ctx.contracts.modules)) {
        output.modules[moduleName] = ctx.contracts.modules[moduleName].address;
    }

    for (let swapHandlerName of Object.keys(ctx.contracts.swapHandlers)) {
        output.swapHandlers[swapHandlerName] = ctx.contracts.swapHandlers[swapHandlerName].address;
    }

    if (ctx.tokenSetup.testing && ctx.tokenSetup.testing.useRealUniswap) {
        output.swapRouterV3.address = ctx.contracts.swapRouterV3.address;
        output.swapRouter02.address = ctx.contracts.swapRouter02.address;
    }

    return output;
}

function writeAddressManifestToFile(ctx, filename) {
    let addressManifest = exportAddressManifest(ctx);
    let outputJson = JSON.stringify(addressManifest, ' ', 4);
    fs.writeFileSync(filename, outputJson + "\n");
}



async function deployContracts(provider, wallets, tokenSetupName, verify = null) {
    let verification = {
        contracts: {
            tokens: {},
            modules: {},
            swapHandlers: {}
        },
    };

    if (verify === "true" && ["goerli"].includes(hre.network.name)) {
        if (!process.env.ETHERSCAN_API_KEY) {
            throw Error("Required process.env.ETHERSCAN_API_KEY variable not found.");
        }
    } else if (verify === "true" && ["mumbai"].includes(hre.network.name)) {
        if (!process.env.POLYGONSCAN_API_KEY) {
            throw Error("Required process.env.POLYGONSCAN_API_KEY variable not found.");
        }
    } else if (verify === "true" && !["goerli", "mumbai"].includes(hre.network.name)) {
        throw Error(`Cannot verify contracts on ${hre.network.name}`);
    }

    let ctx = await buildContext(provider, wallets, tokenSetupName);

    let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

    // Uni V3 router
    let swapRouterV2Address = module.exports.AddressZero;
    let swapRouterV3Address = module.exports.AddressZero;
    let swapRouter02Address = module.exports.AddressZero;
    let oneInchAddress = module.exports.AddressZero;

    if (ctx.tokenSetup.testing) {
        // Default tokens

        for (let token of (ctx.tokenSetup.testing.tokens || [])) {
            ctx.contracts.tokens[token.symbol] = await (await ctx.factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
            verification.contracts.tokens[token.symbol] = {
                address: ctx.contracts.tokens[token.symbol].address, args: [token.name, token.symbol, token.decimals, false], contractPath: "contracts/test/TestERC20.sol:TestERC20"
            };
        }

        for (let [symbol, { address }] of Object.entries(ctx.tokenSetup.testing.forkTokens || {})) {
            ctx.contracts.tokens[symbol] = await ethers.getContractAt('TestERC20', address);
        }

        // Libraries and testing

        if (ctx.tokenSetup.testing.useRealUniswap) {
            {
                const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Factory.json');
                ctx.uniswapV3FactoryFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.uniswapV3Factory = await (await ctx.uniswapV3FactoryFactory.deploy()).deployed();
                verification.contracts.uniswapV3Factory = {
                    address: ctx.contracts.uniswapV3Factory.address, args: []
                };
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/SwapRouterV3.json');
                ctx.SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.swapRouterV3 = await (await ctx.SwapRouterFactory.deploy(ctx.contracts.uniswapV3Factory.address, ctx.contracts.tokens['WETH'].address)).deployed();
                verification.contracts.swapRouterV3 = {
                    address: ctx.contracts.swapRouterV3.address, args: [ctx.contracts.uniswapV3Factory.address, ctx.contracts.tokens['WETH'].address]
                };
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/SwapRouter02.json');
                ctx.SwapRouter02Factory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.swapRouter02 = await (await ctx.SwapRouter02Factory.deploy(
                    module.exports.AddressZero, // factoryV2 not needed
                    ctx.contracts.uniswapV3Factory.address,
                    module.exports.AddressZero, // positionManager not needed
                    ctx.contracts.tokens['WETH'].address
                )).deployed();
                verification.contracts.swapRouter02 = {
                    address: ctx.contracts.swapRouter02.address, 
                    args: [
                        module.exports.AddressZero, 
                        ctx.contracts.uniswapV3Factory.address,
                        module.exports.AddressZero, 
                        ctx.contracts.tokens['WETH'].address
                    ]
                };
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Pool.json');
                ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
            }

            swapRouterV3Address = ctx.contracts.swapRouterV3.address;
            swapRouter02Address = ctx.contracts.swapRouter02.address;
        } else {
            ctx.contracts.uniswapV3Factory = await (await ctx.factories.MockUniswapV3Factory.deploy()).deployed();
            verification.contracts.uniswapV3Factory = { 
                address: ctx.contracts.uniswapV3Factory.address, args: [], contractPath: "contracts/test/MockUniswapV3Factory.sol:MockUniswapV3Factory"
            };

            ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
        }

        ctx.contracts.invariantChecker = await (await ctx.factories.InvariantChecker.deploy()).deployed();
        verification.contracts.invariantChecker = { 
            address: ctx.contracts.invariantChecker.address, args: [], contractPath: "contracts/test/InvariantChecker.sol:InvariantChecker"
        };

        ctx.contracts.flashLoanNativeTest = await (await ctx.factories.FlashLoanNativeTest.deploy()).deployed();
        verification.contracts.flashLoanNativeTest = { 
            address: ctx.contracts.flashLoanNativeTest.address, args: [], contractPath: "contracts/test/FlashLoanNativeTest.sol:FlashLoanNativeTest"
        };

        ctx.contracts.flashLoanAdaptorTest = await (await ctx.factories.FlashLoanAdaptorTest.deploy()).deployed();
        verification.contracts.flashLoanAdaptorTest = { 
            address: ctx.contracts.flashLoanAdaptorTest.address, args: [], contractPath: "contracts/test/FlashLoanAdaptorTest.sol:FlashLoanAdaptorTest"
        };

        ctx.contracts.flashLoanAdaptorTest2 = await (await ctx.factories.FlashLoanAdaptorTest.deploy()).deployed();
        verification.contracts.flashLoanAdaptorTest2 = { 
            address: ctx.contracts.flashLoanAdaptorTest2.address, args: [], contractPath: "contracts/test/FlashLoanAdaptorTest2.sol:FlashLoanAdaptorTest2"
        };

        ctx.contracts.simpleUniswapPeriphery = await (await ctx.factories.SimpleUniswapPeriphery.deploy()).deployed();
        verification.contracts.simpleUniswapPeriphery = { 
            address: ctx.contracts.simpleUniswapPeriphery.address, args: [], contractPath:"contracts/test/SimpleUniswapPeriphery.sol:SimpleUniswapPeriphery"
        };

        // Setup uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            await ctx.createUniswapPool(pair, defaultUniswapFee);
        }

        // Initialize uniswap pools for tokens we will activate
        if (ctx.tokenSetup.testing.useRealUniswap) {
            for (let tok of ctx.tokenSetup.testing.activated) {
                if (tok === 'WETH') continue;
                let config = ctx.tokenSetup.testing.tokens.find(t => t.symbol === tok)
                await (await ctx.contracts.uniswapPools[`${tok}/WETH`].initialize(
                    ctx.poolAdjustedRatioToSqrtPriceX96(`${tok}/WETH`, 10**(18 - config.decimals),
                    1,
                ))).wait();
            }
        }

        if (conf && conf.hooks && conf.hooks.deploy) {
            await conf.hooks.deploy(ctx);
        }
    }


    // Euler Contracts

    // Create module implementations

    let riskManagerSettings;

    if (ctx.tokenSetup.riskManagerSettings) {
        riskManagerSettings = ctx.tokenSetup.riskManagerSettings;
    } else {
        riskManagerSettings = {
            referenceAsset: ctx.contracts.tokens['WETH'].address,
            uniswapFactory: ctx.contracts.uniswapV3Factory.address,
            uniswapPoolInitCodeHash: ctx.uniswapV3PoolByteCodeHash,
        };
    }

    if (ctx.tokenSetup.existingContracts) {
        if (ctx.tokenSetup.existingContracts.swapRouterV2) swapRouterV2Address = ctx.tokenSetup.existingContracts.swapRouterV2;
        if (ctx.tokenSetup.existingContracts.swapRouterV3) swapRouterV3Address = ctx.tokenSetup.existingContracts.swapRouterV3;
        if (ctx.tokenSetup.existingContracts.swapRouter02) swapRouter02Address = ctx.tokenSetup.existingContracts.swapRouter02;
        if (ctx.tokenSetup.existingContracts.oneInch) oneInchAddress = ctx.tokenSetup.existingContracts.oneInch;
    }

    ctx.contracts.modules.installer = await (await ctx.factories.Installer.deploy(gitCommit)).deployed();
    verification.contracts.modules.installer = {
        address: ctx.contracts.modules.installer.address, args: [gitCommit], contractPath: "contracts/modules/Installer.sol:Installer" 
    };

    ctx.contracts.modules.markets = await (await ctx.factories.Markets.deploy(gitCommit)).deployed();
    verification.contracts.modules.markets = {
        address: ctx.contracts.modules.markets.address, args: [gitCommit], contractPath: "contracts/modules/Markets.sol:Markets"
    };

    ctx.contracts.modules.liquidation = await (await ctx.factories.Liquidation.deploy(gitCommit)).deployed();
    verification.contracts.modules.liquidation = {
        address: ctx.contracts.modules.liquidation.address, args: [gitCommit], contractPath: "contracts/modules/Liquidation.sol:Liquidation"
    };

    ctx.contracts.modules.governance = await (await ctx.factories.Governance.deploy(gitCommit)).deployed();
    verification.contracts.modules.governance = {
        address: ctx.contracts.modules.governance.address, args: [gitCommit], contractPath: "contracts/modules/Governance.sol:Governance"
    };
    
    ctx.contracts.modules.exec = await (await ctx.factories.Exec.deploy(gitCommit)).deployed();
    verification.contracts.modules.exec = {
        address: ctx.contracts.modules.exec.address, args: [gitCommit], contractPath: "contracts/modules/Exex.sol:Exec"
    };

    ctx.contracts.modules.swap = await (await ctx.factories.Swap.deploy(gitCommit, swapRouterV3Address, oneInchAddress)).deployed();
    verification.contracts.modules.swap = {
        address: ctx.contracts.modules.swap.address, args: [gitCommit, swapRouterV3Address, oneInchAddress], contractPath: "contracts/modules/Swap.sol:Swap"
    };
    
    ctx.contracts.modules.swapHub = await (await ctx.factories.SwapHub.deploy(gitCommit)).deployed();
    verification.contracts.modules.swapHub = {
        address: ctx.contracts.modules.swapHub.address, args: [gitCommit], contractPath: "contracts/modules/SwapHub.sol:SwapHub"
    };

    ctx.contracts.modules.eToken = await (await ctx.factories.EToken.deploy(gitCommit)).deployed();
    verification.contracts.modules.eToken = {
        address: ctx.contracts.modules.eToken.address, args: [gitCommit], contractPath: "contracts/modules/EToken.sol:EToken"
    };

    ctx.contracts.modules.dToken = await (await ctx.factories.DToken.deploy(gitCommit)).deployed();
    verification.contracts.modules.dToken = {
        address: ctx.contracts.modules.dToken.address, args: [gitCommit], contractPath: "contracts/modules/DToken.sol:DToken"
    };

    ctx.contracts.modules.riskManager = await (await ctx.factories.RiskManager.deploy(gitCommit, riskManagerSettings)).deployed();
    verification.contracts.modules.riskManager = {
        address: ctx.contracts.modules.riskManager.address, args: [gitCommit, riskManagerSettings], contractPath: "contracts/modules/RiskManager.sol:RiskManager"
    };

    ctx.contracts.modules.irmDefault = await (await ctx.factories.IRMDefault.deploy(gitCommit)).deployed();
    verification.contracts.modules.irmDefault = {
        address: ctx.contracts.modules.irmDefault.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/IRMDefault.sol:IRMDefault"
    };

    if (ctx.tokenSetup.testing) {
        ctx.contracts.modules.irmZero = await (await ctx.factories.IRMZero.deploy(gitCommit)).deployed();
        verification.contracts.modules.irmZero = {
            address: ctx.contracts.modules.irmZero.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/test/IRMZero.sol:IRMZero"
        };

        ctx.contracts.modules.irmFixed = await (await ctx.factories.IRMFixed.deploy(gitCommit)).deployed();
        verification.contracts.modules.irmFixed = {
            address: ctx.contracts.modules.irmFixed.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/test/IRMFixed.sol:IRMFixed"
        };

        ctx.contracts.modules.irmLinear = await (await ctx.factories.IRMLinear.deploy(gitCommit)).deployed();
        verification.contracts.modules.irmLinear = {
            address: ctx.contracts.modules.irmLinear.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/test/IRMLinear.sol:IRMLinear"
        };

        if(ctx.tokenSetup.testing.forkTokens) {
            ctx.contracts.modules.irmClassLido = await (await ctx.factories.IRMClassLido.deploy(gitCommit)).deployed();
            verification.contracts.modules.irmClassLido = {
                address: ctx.contracts.modules.irmClassLido.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/IRMClassLido.sol:IRMClassLido"
            };
        }
    }


    // Create euler contract, which also installs the installer module and creates a proxy

    ctx.contracts.euler = await (await ctx.factories.Euler.deploy(ctx.wallet.address, ctx.contracts.modules.installer.address)).deployed();
    verification.contracts.euler = {
        address: ctx.contracts.euler.address, args: [ctx.wallet.address, ctx.contracts.modules.installer.address], contractPath: "contracts/Euler.sol:Euler"
    };

    // Create euler view contracts

    ctx.contracts.eulerSimpleLens = await (await ctx.factories.EulerSimpleLens.deploy(gitCommit, ctx.contracts.euler.address)).deployed();
    verification.contracts.eulerSimpleLens = {
        address: ctx.contracts.eulerSimpleLens.address, args: [gitCommit, ctx.contracts.euler.address], contractPath: "contracts/views/EulerSimpleLens.sol:EulerSimpleLens"
    };

    ctx.contracts.eulerGeneralView = await (await ctx.factories.EulerGeneralView.deploy(gitCommit)).deployed();
    verification.contracts.eulerGeneralView = { 
        address: ctx.contracts.eulerGeneralView.address, args: [gitCommit], contractPath: "contracts/views/EulerGeneralView.sol:EulerGeneralView"
    };

    // Get reference to installer proxy

    ctx.contracts.installer = await ethers.getContractAt('Installer', await ctx.contracts.euler.moduleIdToProxy(moduleIds.INSTALLER));

    // Install the remaining modules

    {
        let modulesToInstall = [
            'markets',
            'liquidation',
            'governance',
            'exec',
            'swap',
            'swapHub',

            'eToken',
            'dToken',

            'riskManager',

            'irmDefault',
        ];

        if (ctx.tokenSetup.testing) {
            modulesToInstall.push(
                'irmZero',
                'irmFixed',
                'irmLinear',
            );

            if(ctx.tokenSetup.testing.forkTokens) {
                modulesToInstall.push('irmClassLido');
            }
        }

        let moduleAddrs = modulesToInstall.map(m => ctx.contracts.modules[m].address);

        await (await ctx.contracts.installer.connect(ctx.wallet).installModules(moduleAddrs)).wait();
    }

    // Get references to external single proxies

    ctx.contracts.markets = await ethers.getContractAt('Markets', await ctx.contracts.euler.moduleIdToProxy(moduleIds.MARKETS));
    ctx.contracts.liquidation = await ethers.getContractAt('Liquidation', await ctx.contracts.euler.moduleIdToProxy(moduleIds.LIQUIDATION));
    ctx.contracts.governance = await ethers.getContractAt('Governance', await ctx.contracts.euler.moduleIdToProxy(moduleIds.GOVERNANCE));
    ctx.contracts.exec = await ethers.getContractAt('Exec', await ctx.contracts.euler.moduleIdToProxy(moduleIds.EXEC));
    ctx.contracts.swap = await ethers.getContractAt('Swap', await ctx.contracts.euler.moduleIdToProxy(moduleIds.SWAP));
    ctx.contracts.swapHub = await ethers.getContractAt('SwapHub', await ctx.contracts.euler.moduleIdToProxy(moduleIds.SWAP_HUB));

    // Deploy swap handlers
    ctx.contracts.swapHandlers.swapHandlerUniswapV3 = await (await ctx.factories.SwapHandlerUniswapV3.deploy(swapRouterV3Address)).deployed();
    verification.contracts.swapHandlers.swapHandlerUniswapV3 = {
        address: ctx.contracts.swapHandlers.swapHandlerUniswapV3.address, args: [swapRouterV3Address], contractPath: "contracts/swapHandlers/SwapHandlerUniswapV3.sol:SwapHandlerUniswapV3"
    };

    ctx.contracts.swapHandlers.swapHandler1Inch = await (await ctx.factories.SwapHandler1Inch.deploy(oneInchAddress, swapRouterV2Address, swapRouterV3Address)).deployed();
    verification.contracts.swapHandlers.swapHandler1Inch = {
        address: ctx.contracts.swapHandlers.swapHandler1Inch.address, args: [oneInchAddress, swapRouterV2Address, swapRouterV3Address], contractPath: "contracts/swapHandlers/SwapHandler1Inch.sol:SwapHandler1Inch"
    };
    
    ctx.contracts.swapHandlers.swapHandlerUniAutoRouter = await (await ctx.factories.SwapHandlerUniAutoRouter.deploy(swapRouter02Address, swapRouterV2Address, swapRouterV3Address)).deployed();
    verification.contracts.swapHandlers.swapHandlerUniAutoRouter = {
        address: ctx.contracts.swapHandlers.swapHandlerUniAutoRouter.address, 
        args: [swapRouter02Address, swapRouterV2Address, swapRouterV3Address], 
        contractPath: "contracts/swapHandlers/SwapHandlerUniAutoRouter.sol:SwapHandlerUniAutoRouter"
    };

    if (ctx.tokenSetup.testing) {
        // Setup default ETokens/DTokens

        for (let tok of ctx.tokenSetup.testing.activated) {
            await ctx.activateMarket(tok);
        }

        for (let tok of (ctx.tokenSetup.testing.tokens || [])) {
            if (tok.config) {
                if (!ctx.tokenSetup.testing.activated.find(s => s === tok.symbol)) throw(`can't set config for unactivated asset: ${tok.symbol}`);
                await ctx.setAssetConfig(ctx.contracts.tokens[tok.symbol].address, tok.config);
            }
        }
    }

    // Setup adaptors

    ctx.contracts.flashLoan = await (await ctx.factories.FlashLoan.deploy(
        ctx.contracts.euler.address,
        ctx.contracts.exec.address,
        ctx.contracts.markets.address,
    )).deployed();
    verification.contracts.flashLoan = {
        address: ctx.contracts.flashLoan.address, 
        args: [
            ctx.contracts.euler.address,
            ctx.contracts.exec.address,
            ctx.contracts.markets.address
        ], 
        contractPath: "contracts/adaptors/FlashLoan.sol:FlashLoan"
    };


    // Setup liquidity mining contracts

    if (ctx.contracts.tokens.EUL) {
        ctx.contracts.eulStakes = await (await ctx.factories.EulStakes.deploy(
            ctx.contracts.tokens.EUL.address,
        )).deployed();
        verification.contracts.eulStakes = {
            address: ctx.contracts.eulStakes.address, 
            args: [
                ctx.contracts.tokens.EUL.address,
            ],
            contractPath: "contracts/mining/EulStakes.sol:EulStakes"
        };

        ctx.contracts.eulDistributor = await (await ctx.factories.EulDistributor.deploy(
            ctx.contracts.tokens.EUL.address,
            ctx.contracts.eulStakes.address,
        )).deployed();
        verification.contracts.eulDistributor = {
            address: ctx.contracts.eulStakes.address, 
            args: [
                ctx.contracts.tokens.EUL.address,
                ctx.contracts.eulStakes.address
            ],
            contractPath: "contracts/mining/EulDistributor.sol:EulDistributor"
        };
    }

    if (verify === "true") {
        let outputJson = JSON.stringify(verification, ' ', 4);
        fs.writeFileSync(`./euler-contracts-verification-${tokenSetupName}.json`, outputJson + "\n");

        // wait 30 seconds for etherscan/polygonscan to index/store contract code 
        await sleep(30000);

        console.log("\n Verifying smart contracts...\n");
        await verifyBatch(verification);
    }

    return ctx;
}


async function loadContracts(provider, wallets, tokenSetupName, addressManifest) {
    let ctx = await buildContext(provider, wallets, tokenSetupName);

    ctx.addressManifest = addressManifest;

    let instanceToContractName = (name) => {
        if (name.startsWith('irm')) return 'IRM' + name.slice(3);
        return name[0].toUpperCase() + name.slice(1);
    };

    // Contracts

    for (let name of Object.keys(addressManifest)) {
        if (typeof(addressManifest[name]) !== 'string') continue;

        if (name === 'swapRouterV3') {
            const { abi, } = require('../vendor-artifacts/SwapRouterV3.json');
            ctx.contracts.swapRouterV3 = new ethers.Contract(addressManifest.swapRouterV3, abi, ethers.provider);
            continue;
        }

        if (name === 'swapRouter02') {
            const { abi, } = require('../vendor-artifacts/SwapRouter02.json');
            ctx.contracts.swapRouter02 = new ethers.Contract(addressManifest.swapRouter02, abi, ethers.provider);
            continue;
        }

        let contractName = instanceToContractName(name);
        if (name === 'uniswapV3Factory') contractName = 'MockUniswapV3Factory'; 

        ctx.contracts[name] = await ethers.getContractAt(contractName, addressManifest[name]);
    }

    // Modules

    for (let name of Object.keys(addressManifest.modules)) {
        ctx.contracts.modules[name] = await ethers.getContractAt(instanceToContractName(name), addressManifest.modules[name]);
    }

    // Swap Handlers

    if (addressManifest.swapHandlers) {
        for (let name of Object.keys(addressManifest.swapHandlers)) {
            ctx.contracts.swapHandlers[name] = await ethers.getContractAt(instanceToContractName(name), addressManifest.swapHandlers[name]);
        }
    }

    // Testing tokens

    if (ctx.tokenSetup.testing) {
        for (let tok of Object.keys(addressManifest.tokens)) {
            ctx.contracts.tokens[tok] = await ethers.getContractAt('TestERC20', addressManifest.tokens[tok]);

            let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(addressManifest.tokens[tok]);
            if (eTokenAddr === module.exports.AddressZero) continue;
            ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

            let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
            ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
        }

        // Uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            await ctx.populateUniswapPool(pair, defaultUniswapFee);
        }
    }

    // Existing tokens

    if (ctx.tokenSetup.existingTokens) {
        for (let tok of Object.keys(ctx.tokenSetup.existingTokens)) {
            let tokenAddr = ctx.tokenSetup.existingTokens[tok].address;

            ctx.contracts.tokens[tok] = await ethers.getContractAt('TestERC20', tokenAddr);

            let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(tokenAddr);
            ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

            let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
            ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
        }
    }

    // Setup custom oracle contracts

    if (ctx.tokenSetup.testing && ctx.tokenSetup.testing.forkTokens) {
        ctx.contracts.WSTETHOracle = await (
            await ctx.factories.WSTETHOracle.deploy(
                ctx.tokenSetup.testing.forkTokens.STETH.address,
                ctx.tokenSetup.existingContracts.chainlinkAggregator_STETH_ETH
            )
        ).deployed();
        ctx.contracts.WBTCOracle = await (
            await ctx.factories.WBTCOracle.deploy(
                ctx.tokenSetup.existingContracts.chainlinkAggregator_WBTC_BTC,
                ctx.tokenSetup.existingContracts.chainlinkAggregator_BTC_ETH,
            )
        ).deployed();
        ctx.contracts.MATICOracle = await (
            await ctx.factories.ChainlinkBasedOracle.deploy(
                ctx.tokenSetup.existingContracts.chainlinkAggregator_MATIC_USD,
                ctx.tokenSetup.existingContracts.chainlinkAggregator_ETH_USD,
                "MATIC/ETH"
            )
        ).deployed();
        ctx.contracts.ENSOracle = await (
            await ctx.factories.ChainlinkBasedOracle.deploy(
                ctx.tokenSetup.existingContracts.chainlinkAggregator_ENS_USD, 
                ctx.tokenSetup.existingContracts.chainlinkAggregator_ETH_USD,
                "ENS/ETH"
            )
        ).deployed();
    }

    return ctx;
}


async function getScriptCtx(tokenSetupName) {
    const eulerAddresses = JSON.parse(fs.readFileSync(`./euler-addresses.json`));
    const ctx = await loadContracts(ethers.provider, await ethers.getSigners(), tokenSetupName, eulerAddresses);
    return ctx;
}

async function getTaskCtx(tokenSetupName) {
    if (!tokenSetupName) {
        tokenSetupName = hre.network.name === 'localhost' ? 'testing' : hre.network.name;
    }

    let filename = hre.network.name === 'localhost' && tokenSetupName === 'testing'
        ? `${__dirname}/../../euler-addresses.json`
        : `${__dirname}/../../addresses/euler-addresses-${tokenSetupName}.json`;

    const eulerAddresses = JSON.parse(fs.readFileSync(filename));
    const ctx = await loadContracts(ethers.provider, await ethers.getSigners(), tokenSetupName, eulerAddresses);
    return ctx;
}




class TestSet {
    constructor(args) {
        this.args = args;
        this.tests = [];
    }

    test(spec) {
        if (spec.dev) this.devMode = true;
        if (spec.skip) this.skipMode = true;
        this.tests.push(spec);
        return this;
    }

    run() {
        if (this.devMode) {
            console.log("****** RUNNING IN DEV MODE (SOME TESTS SKIPPED) ******");
            this.tests = this.tests.filter(spec => spec.dev);
        }

        if (this.skipMode) {
            console.log("****** RUNNING IN SKIP MODE (SOME TESTS SKIPPED) ******");
            this.tests = this.tests.filter(spec => !spec.skip);
        }

        let fixture = fixtureFactory(this.args.fixture || 'testing', this.args.forkAtBlock);

        describe(this.args.desc || __filename, () => {
            let testNum = 0;
            for (let spec of this.tests) {
                let timeout;
                if (this.args.timeout) timeout = this.args.timeout;
                if (spec.timeout) timeout = spec.timeout;
                if (process.env.TEST_TIMEOUT) timeout = parseInt(process.env.TEST_TIMEOUT);

                let test = it(spec.desc || `test #${testNum}`, async () => {
                    await this._runTest(spec, fixture);
                });

                if(timeout) test.timeout(timeout);

                testNum++;
            }
        });
    }

    async _runTest(spec, fixture) {
        if (spec.forkAtBlock) fixture = fixtureFactory('mainnet-fork', spec.forkAtBlock);
        let ctx = await loadFixture(fixture);

        let actions = [
            { action: 'checkpointTime' },
        ];

        if (this.args.preActions) actions = actions.concat(this.args.preActions(ctx));
        for (let action of actions) {
            await this._runAction(spec, ctx, action);
        }
        actions = spec.actions(ctx);

        for (let action of actions) {
            let err, result;

            try {
                result = await this._runAction(spec, ctx, action);
            } catch (e) {
                err = true;
                if (action.expectError) {
                    if (!e.message.match(action.expectError)) throw(`expected error "${action.expectError}" but instead got "${e.message}"`);
                } else if (action.expectNoReasonError) {
                    if(e.message !== 'Transaction reverted without a reason string') throw(`Expected revert without reason, but got "${e.message}"`);
                } else {
                    throw(e);
                }
            }

            let makeBN = (x) => typeof(x) === 'number' ? ethers.BigNumber.from(x) : x;

            if (action.dump) console.log(dumpObj(result, 18));
            if (action.onResult) await action.onResult(result);

            {
                let assertEql = action.assertEql;

                if (assertEql !== undefined) {
                    if (typeof(assertEql) === 'function') assertEql = assertEql();

                    if (Array.isArray(assertEql) || typeof(assertEql) === 'string') {
                        expect(result).to.eql(assertEql);
                    } else {
                        equals(result, makeBN(assertEql));
                    }
                }
            }

            if (action.equals !== undefined) {
                let args = action.equals;
                if (typeof(args) === 'function') args = await args();
                if (!Array.isArray(args)) args = [args];
                equals(result, args[0], args[1]);
            }

            if (action.assertResult !== undefined) action.assertResult(result);

            if (action.expectError !== undefined && !err) throw(`expected error "${action.expectError}" but no error was thrown`);

            if ((process.env.INVARIANTS && (action.send || action.action === 'jumpTimeAndMine')) || action.invariants) {
                let markets = ['TST', 'TST2', 'TST3', 'TST6', 'TST9'].map(m => ctx.contracts.tokens[m].address);
                let accounts = [ctx.wallet.address, ctx.wallet2.address, ctx.wallet3.address, ctx.wallet4.address, ctx.wallet5.address];

                let result = await ctx.contracts.invariantChecker.check(ctx.contracts.euler.address, markets, accounts, !!process.env.VERBOSE);
            }
        }
    }

    async _runAction(spec, ctx, action) {
        if (process.env.VERBOSE) console.log(action.send || action.call || action.callStatic || action.action);

        // Helps flushing out non-deterministic tests that incorrectly depend on test run-times
        if (process.env.TEST_SLEEP) {
            if (action.send || action.action === 'jumpTimeAndMine') await sleep(parseInt(process.env.TEST_SLEEP));
        }

        let reportGas = (result) => {
            let name = action.send || action.action;
            if (this.args.gas || spec.gas || action.gas || process.env.GAS) console.log(`GAS(${name}) : ${result.gasUsed}`);
        };

        if (typeof(action) === 'function') action = { cb: action, };
        let args = await Promise.all((action.args || []).map(async a => typeof(a) === 'function' ? await a() : a));

        if (action.send !== undefined) {
            let components = action.send.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            let from = action.from || ctx.wallet;

            let tx = await contract.connect(from).functions[components[0]].apply(null, args);
            let result = await tx.wait();
            if (action.dumpResult) console.log(dumpObj(result));

            if (action.onLogs) {
                let logsList = [];

                for (let log of result.logs) {
                    let parsedLog;

                    try {
                        parsedLog = contract.interface.parseLog(log);
                    } catch(e) {
                        continue;
                    }

                    parsedLog.address = log.address;

                    logsList.push(parsedLog);
                }

                action.onLogs(logsList);
            }

            if (action.onRawLogs) {
                action.onRawLogs(result.logs)
            }

            reportGas(result);
        } else if (action.action === 'sendBatch') {
            let items = await Promise.all(action.batch.map(async b => {
                let components = b.send.split('.');
                let contract = ctx.contracts;
                while (components.length > 1) contract = contract[components.shift()];

                let args = await Promise.all((b.args || []).map(async a => typeof(a) === 'function' ? await a() : a));

                return {
                    allowError: b.allowError || false,
                    proxyAddr: contract.address,
                    data: contract.interface.encodeFunctionData(components[0], args),
                };
            }));

            let from = action.from || ctx.wallet;

            let result;

            if (action.simulate) {
                try {
                    await ctx.contracts.exec.connect(from).callStatic.batchDispatchSimulate(items, action.deferLiquidityChecks || []);
                } catch (e) {
                    if (e.errorName !== 'BatchDispatchSimulation') throw e;
                    result = e.errorArgs.simulation;
                }
            } else {
                let tx = await ctx.contracts.exec.connect(from).batchDispatch(items, action.deferLiquidityChecks || []);
                result = await tx.wait();
            }

            // FIXME: report/detect errors
            if (action.dumpResult) console.log(dumpObj(result));
            reportGas(result);

            return result;
        } else if (action.call !== undefined) {
            let components = action.call.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            return await contract[components[0]].apply(null, args);
        } else if (action.callStatic !== undefined) {
            let components = action.callStatic.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            return await contract.callStatic[components[0]].apply(null, args);
        } else if (action.action === 'cb' || action.cb) {
            await action.cb(ctx);
        } else if (action.action === 'activateMarket') {
            await ctx.activateMarket(action.tok);
        } else if (action.action === 'createUniswapPool') {
            await ctx.createUniswapPool(action.pair.split('/'), action.fee);
        } else if (action.action === 'updateUniswapPrice') {
            await ctx.updateUniswapPrice(action.pair, action.price);
        } else if (action.action === 'setAssetConfig') {
            let underlying = ctx.contracts.tokens[action.tok].address;
            await ctx.setAssetConfig(underlying, action.config);
        } else if (action.action === 'setTokenBalanceInStorage') {
            await ctx.setTokenBalanceInStorage(action.token, action.for, action.amount, action.slot);
        } else if (action.action === 'doUniswapSwap') {
            await ctx.doUniswapSwap(action.from || ctx.wallet, action.tok, action.dir, action.amount, action.priceLimit);
        } else if (action.action === 'getPrice') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.getPriceFull(token.address);
        } else if (action.action === 'getPriceMinimal') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.getPrice(token.address);
        } else if (action.action === 'checkpointTime') {
            await ctx.checkpointTime();
        } else if (action.action === 'jumpTime') {
            await ctx.jumpTime(action.time);
        } else if (action.action === 'jumpTimeAndMine') {
            await ctx.jumpTime(action.time);
            await ctx.mineEmptyBlock();
        } else if (action.action === 'snapshot') {
            await ctx.snapshot();
        } else if (action.action === 'revert') {
            await ctx.revert();
        } else if (action.action === 'mineEmptyBlock') {
            await ctx.mineEmptyBlock();
        } else if (action.action === 'setIRM') {
            let resetParams = action.resetParams || Buffer.from("");
            await ctx.setIRM(ctx.contracts.tokens[action.underlying].address, moduleIds[action.irm], resetParams);
        } else if (action.action === 'setReserveFee') {
            let fee;
            if (action.fee === 'default') fee = 2**32 - 1;
            else fee = Math.floor(action.fee * 4e9)

            await ctx.setReserveFee(ctx.contracts.tokens[action.underlying].address, fee);
        } else if (action.action === 'run') {
            await action.cb(ctx);
        } else if (action.action === 'installTestModule') {
            ctx.contracts.modules.testModule = await (await ctx.factories.TestModule.deploy(action.id)).deployed();
            await (await ctx.contracts.installer.connect(ctx.wallet).installModules([ctx.contracts.modules.testModule.address])).wait();
            ctx.contracts.testModule = await ethers.getContractAt('TestModule', await ctx.contracts.euler.moduleIdToProxy(action.id));
        } else if (action.action === 'signPermit') {
            let tokenAddress, permitType, permitDomain;
            if (ctx.tokenSetup.testing && ctx.tokenSetup.testing.forkTokens) {
                tokenAddress = ctx.tokenSetup.testing.forkTokens[action.token].address;
                permitType = ctx.tokenSetup.testing.forkTokens[action.token].permit.type;
                permitDomain = ctx.tokenSetup.testing.forkTokens[action.token].permit.domain;
            } else {
                tokenAddress = ctx.contracts.tokens[action.token].address;
                permitType = action.permitType;
                permitDomain = action.domain;
            }

            return await ctx.signPermit(
                tokenAddress,
                action.signer,
                permitType,
                permitDomain,
                action.spender,
                action.value,
                action.deadline,
            );
        } else {
            throw(`unknown action: ${action.action}`);
        }
    }
}

function testSet(args) {
    return new TestSet(args);
}





function cleanupObj(obj, decimals) {
    if (obj === null) return obj;

    if (typeof obj === 'object') {
        if (obj._isBigNumber) {
            if (decimals === undefined) return obj.toString();
            else return ethers.utils.formatUnits(obj, decimals);
        }

        if (obj.length === Object.keys(obj).length) {
            return obj.map(o => cleanupObj(o, decimals));
        }

        let ret = {};

        for (let k of Object.keys(obj)) {
            if ('' + parseInt(k) === k) continue;
            ret[k] = cleanupObj(obj[k], decimals);
        }

        return ret;
    }

    return obj;
}


function dumpObj(obj, decimals) {
    return util.inspect(cleanupObj(obj, decimals), false, null, true);
}




function getSubAccount(primary, subAccountId) {
    if (parseInt(subAccountId) !== subAccountId || subAccountId > 256) throw(`invalid subAccountId: ${subAccountId}`);
    return ethers.utils.hexZeroPad(ethers.BigNumber.from(primary).xor(subAccountId), 20);
}





function equals(val, expected, tolerance) {
    if (typeof(val) === 'number') {
        if (tolerance === undefined) tolerance = 0;

        let difference = Math.abs(val - expected);

        if (difference > tolerance) {
            let formattedTolerance = '';
            if (tolerance !== 0) formattedTolerance = ` +/- ${tolerance}`;
            throw Error(`equals failure: ${val} was not ${expected}${formattedTolerance}`);
        }
    } else {
        if (tolerance === undefined) tolerance = ethers.BigNumber.from(0);

        if (typeof(expected) === 'number' || typeof(expected) === 'string') expected = ethers.utils.parseEther('' + expected);
        if (typeof(tolerance) === 'number' || typeof(tolerance) === 'string') tolerance = ethers.utils.parseEther('' + tolerance);

        let difference = val.sub(expected).abs();

        if (difference.gt(tolerance)) {
            let formattedTolerance = '';
            if (!tolerance.eq(0)) formattedTolerance = ` +/- ${ethers.utils.formatEther(tolerance)}`;
            throw Error(`equals failure: ${ethers.utils.formatEther(val)} was not ${ethers.utils.formatEther(expected)}${formattedTolerance}`);
        }
    }

    return true
}

const config = path => {
    if (path) {
        conf = require(path);
    }

    return module.exports;
};


let taskUtils = {
    runTx: async (txPromise) => {
        let tx = await txPromise;
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);

        let result = await tx.wait();
        console.log(`Mined. Status: ${result.status}`);
        return result;
    },

    lookupAddress: async (ctx, addr) => {
        if (addr === 'me') return ctx.wallet.address;
        if (addr === 'euler') return ctx.contracts.euler.address;
        if (addr === 'ref') return ctx.tokenSetup.riskManagerSettings.referenceAsset;
        if (addr.startsWith('0x')) return addr;
        throw(`unable to lookup address: ${addr}`);
    },

    lookupToken: async (ctx, sym) => {
        if (sym === 'ref') return await ethers.getContractAt('TestERC20', ctx.tokenSetup.riskManagerSettings.referenceAsset);
        if (sym.startsWith('0x')) return await ethers.getContractAt('TestERC20', sym);
        if (ctx.contracts.tokens[sym]) return ctx.contracts.tokens[sym];
        throw(`unable to lookup token: ${sym}`);
    },
};


async function sleep(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}



module.exports = {
    testSet,

    // default fixtures
    standardTestingFixture: fixtureFactory('testing'),
    deployContracts,
    loadContracts,
    exportAddressManifest,
    writeAddressManifestToFile,
    getScriptCtx,
    getTaskCtx,
    defaultTestAccounts,

    // re-exports for convenience
    loadFixture,
    expect,
    assert,
    ethers,

    // testing utils
    equals,

    // utils
    MaxUint256: ethers.constants.MaxUint256,
    AddressZero: ethers.constants.AddressZero,
    HashZero: ethers.constants.HashZero,
    BN: ethers.BigNumber.from,
    DefaultUniswapFee: defaultUniswapFee,
    eth: (v) => ethers.utils.parseEther('' + v),
    units: (v, decimals) => ethers.utils.parseUnits('' + v, decimals),
    formatUnits: (v, decimals) => ethers.utils.formatUnits('' + v, decimals),
    abiEncode: (types, values) => ethers.utils.defaultAbiCoder.encode(types, values),
    encodePacked: (types, values) => ethers.utils.solidityPack(types, values),
    getSubAccount,
    ratioToSqrtPriceX96,
    sqrtPriceX96ToPrice,
    c1e18: ethers.BigNumber.from(10).pow(18),
    c1e27: ethers.BigNumber.from(10).pow(27),
    linearIRM,
    FeeAmount,
    SecondsPerYear: 365.2425 * 86400,
    DefaultReserve: 1e6,

    // dev utils
    cleanupObj,
    dumpObj,

    // tasks
    taskUtils,
    moduleIds,

    config,
};
