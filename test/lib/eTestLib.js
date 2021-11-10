require("@nomiclabs/hardhat-waffle");

const { expect, assert, } = require("chai");
const { loadFixture, } = waffle;

const fs = require("fs");
const util = require("util");

const { Route, Pool, FeeAmount, TICK_SPACINGS, encodeRouteToPath, nearestUsableTick, TickMath } = require('@uniswap/v3-sdk');
const { Token, CurrencyAmount } = require('@uniswap/sdk-core');
const JSBI = require('jsbi')

const { ratioToSqrtPriceX96, sqrtPriceX96ToPrice, } = require("./sqrtPriceUtils.js");

Error.stackTraceLimit = 10000;




const moduleIds = {
    // Public single-proxy modules
    INSTALLER: 1,
    MARKETS: 2,
    LIQUIDATION: 3,
    GOVERNANCE: 4,
    EXEC: 5,
    SWAP: 6,

    // Public multi-proxy modules
    ETOKEN: 500000,
    DTOKEN: 500001,

    // Internal modules
    RISK_MANAGER: 1000000,

    IRM_DEFAULT: 2000000,
    IRM_ZERO: 2000001,
    IRM_FIXED: 2000002,
    IRM_LINEAR: 2000100,
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
    'EToken',
    'DToken',

    // Internal modules

    'RiskManager',
    'IRMDefault',
    'IRMZero',
    'IRMFixed',
    'IRMLinear',

    // Adaptors

    'FlashLoan',

    // Testing

    'TestERC20',
    'MockUniswapV3Factory',
    'EulerGeneralView',
    'InvariantChecker',
    'FlashLoanNativeTest',
    'FlashLoanAdaptorTest',
    'SimpleUniswapPeriphery',
    'TestModule',
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
            if(ctx.contracts.tokens[t0s].address.toLowerCase() > ctx.contracts.tokens[t1s].address.toLowerCase())
                [t0, t1] = [t1, t0];
            return new Pool(t0, t1, defaultUniswapFee, ratioToSqrtPriceX96(1, 1), 0, 0, []);
        }));

        let route = new Route(pools, tokens[inTokenSymbol], tokens[outTokenSymbol]);
        return encodeRouteToPath(route, exactOutput);
    }

    ctx.getUniswapInOutAmounts = async (amount, poolSymbols, liquidity, sqrtPriceX96 = ratioToSqrtPriceX96(1, 1)) => {
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
        let [outAmount] = await pool.getOutputAmount(CurrencyAmount.fromRawAmount(t0, amount))
        let [inAmount] = await pool.getInputAmount(CurrencyAmount.fromRawAmount(t0, amount))
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
            while(slot.startsWith('0x0')) slot = '0x' + slot.slice(3);

            let prev = await network.provider.send('eth_getStorageAt', [address, slot, 'latest']);
            await ctx.setStorageAt(address, slot, val);
            let balance = await ctx.contracts.tokens[token].balanceOf(account);
            await ctx.setStorageAt(address, slot, prev);

            if (balance.eq(ethers.BigNumber.from(val))) {
                ctx.tokenBalancesSlot[token] = i;
                return i;
            }
        }

        throw 'balances slot not found!';
    }

    ctx.setTokenBalanceInStorage = async (token, account, amount) => {
        let balancesSlot = await ctx.tokenBalancesSlot(token);

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
        let decimals = 18; // prices are always in WETH, which is 18 decimals

        let a = ethers.utils.parseEther('1');
        let b = typeof(price) === 'string' ? ethers.utils.parseUnits(price, decimals) : price;
        let poolContract = ctx.contracts.uniswapPools[pair];
        if (!poolContract) throw(Error(`Unknown pair: ${pair}`));

        if (ctx.uniswapPoolsInverted[pair]) [a, b] = [b, a];

        let sqrtPriceX96 = ratioToSqrtPriceX96(a, b);

        await (await poolContract.mockSetTwap(sqrtPriceX96)).wait();
    };

    ctx.doUniswapSwap = async (from, tok, dir, amount, priceLimit) => {
        let buy = dir === 'buy';
        let priceLimitRatio;

        if (ethers.BigNumber.from(ctx.contracts.tokens.WETH.address).lt(ctx.contracts.tokens[tok].address)) {
            buy = !buy;
            priceLimitRatio = ratioToSqrtPriceX96(priceLimit, 1);
        } else {
            priceLimitRatio = ratioToSqrtPriceX96(1, priceLimit);
        }

        if (buy) {
            let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact0For1(ctx.contracts.uniswapPools[`${tok}/WETH`].address, amount, from.address, priceLimitRatio);
            await tx.wait();
        } else {
            let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact1For0(ctx.contracts.uniswapPools[`${tok}/WETH`].address, amount, from.address, priceLimitRatio);
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

    if (ctx.tokenSetup.testing && ctx.tokenSetup.testing.useRealUniswap) {
        output.swapRouter.address = ctx.contracts.swapRouter.address;
    }

    return output;
}

function writeAddressManifestToFile(ctx, filename) {
    let addressManifest = exportAddressManifest(ctx);
    let outputJson = JSON.stringify(addressManifest, ' ', 4);
    fs.writeFileSync(filename, outputJson + "\n");
}



async function deployContracts(provider, wallets, tokenSetupName) {
    let ctx = await buildContext(provider, wallets, tokenSetupName);

    let swapRouterAddress = module.exports.AddressZero;
    let oneInchAddress = module.exports.AddressZero;

    if (ctx.tokenSetup.testing) {
        // Default tokens

        for (let token of (ctx.tokenSetup.testing.tokens || [])) {
            ctx.contracts.tokens[token.symbol] = await (await ctx.factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
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
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/SwapRouter.json');
                ctx.SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.swapRouter = await (await ctx.SwapRouterFactory.deploy(ctx.contracts.uniswapV3Factory.address, ctx.contracts.tokens['WETH'].address)).deployed();
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Pool.json');
                ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
            }

            swapRouterAddress = ctx.contracts.swapRouter.address;
        } else {
            ctx.contracts.uniswapV3Factory = await (await ctx.factories.MockUniswapV3Factory.deploy()).deployed();
            ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
        }

        ctx.contracts.invariantChecker = await (await ctx.factories.InvariantChecker.deploy()).deployed();
        ctx.contracts.flashLoanNativeTest = await (await ctx.factories.FlashLoanNativeTest.deploy()).deployed();
        ctx.contracts.flashLoanAdaptorTest = await (await ctx.factories.FlashLoanAdaptorTest.deploy()).deployed();
        ctx.contracts.flashLoanAdaptorTest2 = await (await ctx.factories.FlashLoanAdaptorTest.deploy()).deployed();
        ctx.contracts.simpleUniswapPeriphery = await (await ctx.factories.SimpleUniswapPeriphery.deploy()).deployed();

        // Setup uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            await ctx.createUniswapPool(pair, defaultUniswapFee);
        }

        // Initialize uniswap pools for tokens we will activate
        if (ctx.tokenSetup.testing.useRealUniswap) {
            for (let tok of ctx.tokenSetup.testing.activated) {
                if (tok === 'WETH') continue;
                await (await ctx.contracts.uniswapPools[`${tok}/WETH`].initialize(ratioToSqrtPriceX96(1, 1))).wait();
            }
        }
    }


    // Euler Contracts

    ctx.contracts.eulerGeneralView = await (await ctx.factories.EulerGeneralView.deploy()).deployed();

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
        if (ctx.tokenSetup.existingContracts.swapRouter) swapRouterAddress = ctx.tokenSetup.existingContracts.swapRouter;
        if (ctx.tokenSetup.existingContracts.oneInch) oneInchAddress = ctx.tokenSetup.existingContracts.oneInch;
    }

    ctx.contracts.modules.installer = await (await ctx.factories.Installer.deploy()).deployed();
    ctx.contracts.modules.markets = await (await ctx.factories.Markets.deploy()).deployed();
    ctx.contracts.modules.liquidation = await (await ctx.factories.Liquidation.deploy()).deployed();
    ctx.contracts.modules.governance = await (await ctx.factories.Governance.deploy()).deployed();
    ctx.contracts.modules.exec = await (await ctx.factories.Exec.deploy()).deployed();
    ctx.contracts.modules.swap = await (await ctx.factories.Swap.deploy(swapRouterAddress, oneInchAddress)).deployed();

    ctx.contracts.modules.eToken = await (await ctx.factories.EToken.deploy()).deployed();
    ctx.contracts.modules.dToken = await (await ctx.factories.DToken.deploy()).deployed();

    ctx.contracts.modules.riskManager = await (await ctx.factories.RiskManager.deploy(riskManagerSettings)).deployed();

    ctx.contracts.modules.irmDefault = await (await ctx.factories.IRMDefault.deploy()).deployed();
    
    if (ctx.tokenSetup.testing) {
        ctx.contracts.modules.irmZero = await (await ctx.factories.IRMZero.deploy()).deployed();
        ctx.contracts.modules.irmFixed = await (await ctx.factories.IRMFixed.deploy()).deployed();
        ctx.contracts.modules.irmLinear = await (await ctx.factories.IRMLinear.deploy()).deployed();
    }


    // Create euler contract, which also installs the installer module and creates a proxy

    ctx.contracts.euler = await (await ctx.factories.Euler.deploy(ctx.wallet.address, ctx.contracts.modules.installer.address)).deployed();

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

            'eToken',
            'dToken',

            'riskManager',

            'irmDefault',
        ];

        if (ctx.tokenSetup.testing) modulesToInstall.push(
            'irmZero',
            'irmFixed',
            'irmLinear',
        );

        let moduleAddrs = modulesToInstall.map(m => ctx.contracts.modules[m].address);

        await (await ctx.contracts.installer.connect(ctx.wallet).installModules(moduleAddrs)).wait();
    }

    // Get references to external single proxies

    ctx.contracts.markets = await ethers.getContractAt('Markets', await ctx.contracts.euler.moduleIdToProxy(moduleIds.MARKETS));
    ctx.contracts.liquidation = await ethers.getContractAt('Liquidation', await ctx.contracts.euler.moduleIdToProxy(moduleIds.LIQUIDATION));
    ctx.contracts.governance = await ethers.getContractAt('Governance', await ctx.contracts.euler.moduleIdToProxy(moduleIds.GOVERNANCE));
    ctx.contracts.exec = await ethers.getContractAt('Exec', await ctx.contracts.euler.moduleIdToProxy(moduleIds.EXEC));
    ctx.contracts.swap = await ethers.getContractAt('Swap', await ctx.contracts.euler.moduleIdToProxy(moduleIds.SWAP));


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

    return ctx;
}


async function loadContracts(provider, wallets, tokenSetupName, addressManifest) {
    let ctx = await buildContext(provider, wallets, tokenSetupName);

    let instanceToContractName = (name) => {
        if (name.startsWith('irm')) return 'IRM' + name.slice(3);
        return name[0].toUpperCase() + name.slice(1);
    };

    // Contracts

    for (let name of Object.keys(addressManifest)) {
        if (typeof(addressManifest[name]) !== 'string') continue;

        if (name === 'swapRouter') {
            ctx.swapRouterAddress = addressManifest.swapRouter;
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

    // Testing tokens

    if (ctx.tokenSetup.testing) {
        for (let tok of Object.keys(addressManifest.tokens)) {
            ctx.contracts.tokens[tok] = await ethers.getContractAt('TestERC20', addressManifest.tokens[tok]);

            let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(addressManifest.tokens[tok]);
            if (eTokenAddr === ethers.constants.AddressZero) continue;
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

    let filename = hre.network.name === 'localhost' ? './euler-addresses.json' : `./addresses/euler-addresses-${hre.network.name}.json`
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

        let self = this;
        describe(this.args.desc || __filename, function () {
            if(self.args.timeout) this.timeout(self.args.timeout);

            let testNum = 0;
            for (let spec of self.tests) {
                it(spec.desc || `test #${testNum}`, async () => {
                    await self._runTest.apply(self, [spec, fixture]);
                });

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

            if (action.assertEq !== undefined) expect(result).to.eql(makeBN(action.assertEq));
            if (action.assertEql !== undefined) expect(result).to.eql(makeBN(
                typeof(action.assertEql) === 'function' ? action.assertEql() : action.assertEql
            ));
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
            let items = action.batch.map(b => {
                let components = b.send.split('.');
                let contract = ctx.contracts;
                while (components.length > 1) contract = contract[components.shift()];

                let args = (b.args || []).map(a => typeof(a) === 'function' ? a() : a);

                return {
                    allowError: b.allowError || false,
                    proxyAddr: contract.address,
                    data: contract.interface.encodeFunctionData(components[0], args),
                };
            });

            let from = action.from || ctx.wallet;

            let result;

            if (action.dryRun) {
                result = await ctx.contracts.exec.callStatic.batchDispatchExtra(items, action.deferLiquidityChecks || [], action.toQuery || []);
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
            await ctx.setTokenBalanceInStorage(action.token, action.for, action.amount);
        } else if (action.action === 'doUniswapSwap') {
            await ctx.doUniswapSwap(action.from || ctx.wallet, action.tok, action.dir, action.amount, action.priceLimit);
        } else if (action.action === 'getPrice') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.callStatic.getPriceFull(token.address);
        } else if (action.action === 'getPriceMinimal') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.callStatic.getPrice(token.address);
        } else if (action.action === 'getPriceNonStatic') {
            let token = ctx.contracts.tokens[action.underlying];
            let tx = await ctx.contracts.exec.getPriceFull(token.address);
            let result = await tx.wait();
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
}



let taskUtils = {
    runTx: async (txPromise) => {
        let tx = await txPromise;
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);

        let result = await tx.wait();
        console.log(`Mined. Status: ${result.status}`);
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

    // dev utils
    cleanupObj,
    dumpObj,

    // tasks
    taskUtils,
    moduleIds,
};
