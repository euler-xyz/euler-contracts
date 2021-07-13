require("@nomiclabs/hardhat-waffle");

const { expect, assert, } = require("chai");
const { loadFixture, } = waffle;

const bn = require("bignumber.js");
const fs = require("fs");
const util = require("util");


Error.stackTraceLimit = 10000;
bn.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 })




const moduleIds = {
    // Public single-proxy modules
    INSTALLER: 1,
    MARKETS: 2,
    LIQUIDATION: 3,
    GOVERNANCE: 4,
    EXEC: 5,

    // Public multi-proxy modules
    ETOKEN: 500000,
    DTOKEN: 500001,

    // Internal modules
    RISK_MANAGER: 1000000,

    IRM_DEFAULT: 2000000,
    IRM_ZERO: 2000001,
    IRM_FIXED: 2000002,
    IRM_LINEAR: 2000100,
    IRM_LINEAR_RECURSIVE: 2000101,
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
    'EToken',
    'DToken',

    // Internal modules

    'RiskManager',
    'IRMDefault',
    'IRMZero',
    'IRMFixed',
    'IRMLinear',
    'IRMLinearRecursive',

    // Testing

    'TestERC20',
    'MockUniswapV3Factory',
    'EulerGeneralView',
    'InvariantChecker',
    'FlashLoanTest',
    'SimpleUniswapPeriphery',
];




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


const defaultUniswapFee = 3000;



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
    }


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


    // Price updates

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


    // Governance methods

    ctx.setIRM = async (underlying, irm, resetParams) => {
        await (await ctx.contracts.governance.connect(ctx.wallet).setIRM(underlying, irm, resetParams)).wait();
    };

    ctx.setReserveFee = async (underlying, newReserveFee) => {
        await (await ctx.contracts.governance.connect(ctx.wallet).setReserveFee(underlying, newReserveFee)).wait();
    };

    ctx.setAssetConfig = async (underlying, newConfig) => {
        let config = await ctx.contracts.markets.underlyingToAssetConfig(underlying);

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

        await (await ctx.contracts.governance.connect(ctx.wallet).setAssetConfig(underlying, config)).wait();
    };


    return ctx;
}



async function buildFixture(provider, tokenSetupName) {
    let wallets = await ethers.getSigners();

    let addressManifest;

    {
        let ctx = await deployContracts(provider, wallets, tokenSetupName);

        addressManifest = exportAddressManifest(ctx);
    }

    if (process.env.VERBOSE) console.log(addressManifest);

    let ctx = await loadContracts(provider, wallets, tokenSetupName, addressManifest);

    return ctx;
}

async function standardTestingFixture(_, provider) {
    return await buildFixture(provider, 'testing');
}

async function realUniswapTestingFixture(_, provider) {
    return await buildFixture(provider, 'testing-real-uniswap');
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

    return output;
}

function writeAddressManifestToFile(ctx, filename) {
    let addressManifest = exportAddressManifest(ctx);
    let outputJson = JSON.stringify(addressManifest, ' ', 4);
    fs.writeFileSync(filename, outputJson + "\n");
}



async function deployContracts(provider, wallets, tokenSetupName) {
    let ctx = await buildContext(provider, wallets, tokenSetupName);

    if (ctx.tokenSetup.testing) {
        // Default tokens

        for (let token of ctx.tokenSetup.testing.tokens) {
            ctx.contracts.tokens[token.symbol] = await (await ctx.factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
        }

        // Libraries and testing

        if (ctx.tokenSetup.testing.useRealUniswap) {
            {
                const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Factory.json');
                ctx.uniswapV3FactoryFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.mockUniswapV3Factory = await (await ctx.uniswapV3FactoryFactory.deploy()).deployed();
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/SwapRouter.json');
                ctx.SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
                ctx.contracts.swapRouter = await (await ctx.SwapRouterFactory.deploy(ctx.contracts.mockUniswapV3Factory.address, ctx.contracts.tokens['WETH'].address)).deployed();
            }
            {
                const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Pool.json');
                ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
            }
        } else {
            ctx.contracts.mockUniswapV3Factory = await (await ctx.factories.MockUniswapV3Factory.deploy()).deployed();
            ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
        }

        ctx.contracts.invariantChecker = await (await ctx.factories.InvariantChecker.deploy()).deployed();
        ctx.contracts.flashLoanTest = await (await ctx.factories.FlashLoanTest.deploy()).deployed();
        ctx.contracts.simpleUniswapPeriphery = await (await ctx.factories.SimpleUniswapPeriphery.deploy()).deployed();

        // Setup uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            await (await ctx.contracts.mockUniswapV3Factory.createPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee)).wait();
            const addr = await ctx.contracts.mockUniswapV3Factory.getPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee);

            ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
            ctx.contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

            let inverted = ethers.BigNumber.from(ctx.contracts.tokens[pair[0]].address).gt(ctx.contracts.tokens[pair[1]].address);
            ctx.uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = inverted;
            ctx.uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = !inverted;

            let tx = await ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`].initialize(ratioToSqrtPriceX96(ethers.utils.parseEther("1"), ethers.utils.parseEther("1")));
            await tx.wait();
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
            uniswapFactory: ctx.contracts.mockUniswapV3Factory.address,
            uniswapPoolInitCodeHash: ctx.uniswapV3PoolByteCodeHash,
        };
    }

    ctx.contracts.modules.installer = await (await ctx.factories.Installer.deploy()).deployed();
    ctx.contracts.modules.markets = await (await ctx.factories.Markets.deploy()).deployed();
    ctx.contracts.modules.liquidation = await (await ctx.factories.Liquidation.deploy()).deployed();
    ctx.contracts.modules.governance = await (await ctx.factories.Governance.deploy()).deployed();
    ctx.contracts.modules.exec = await (await ctx.factories.Exec.deploy()).deployed();

    ctx.contracts.modules.eToken = await (await ctx.factories.EToken.deploy()).deployed();
    ctx.contracts.modules.dToken = await (await ctx.factories.DToken.deploy()).deployed();

    ctx.contracts.modules.riskManager = await (await ctx.factories.RiskManager.deploy(riskManagerSettings)).deployed();

    ctx.contracts.modules.irmDefault = await (await ctx.factories.IRMDefault.deploy()).deployed();

    if (ctx.tokenSetup.testing) {
        ctx.contracts.modules.irmZero = await (await ctx.factories.IRMZero.deploy()).deployed();
        ctx.contracts.modules.irmFixed = await (await ctx.factories.IRMFixed.deploy()).deployed();
        ctx.contracts.modules.irmLinear = await (await ctx.factories.IRMLinear.deploy()).deployed();
        ctx.contracts.modules.irmLinearRecursive = await (await ctx.factories.IRMLinearRecursive.deploy()).deployed();
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

            'eToken',
            'dToken',

            'riskManager',

            'irmDefault',
        ];

        if (ctx.tokenSetup.testing) modulesToInstall.push(
            'irmZero',
            'irmFixed',
            'irmLinear',
            'irmLinearRecursive',
        );

        let moduleAddrs = modulesToInstall.map(m => ctx.contracts.modules[m].address);

        await (await ctx.contracts.installer.connect(ctx.wallet).installModules(moduleAddrs)).wait();
    }

    // Get references to external single proxies

    ctx.contracts.markets = await ethers.getContractAt('Markets', await ctx.contracts.euler.moduleIdToProxy(moduleIds.MARKETS));
    ctx.contracts.liquidation = await ethers.getContractAt('Liquidation', await ctx.contracts.euler.moduleIdToProxy(moduleIds.LIQUIDATION));
    ctx.contracts.governance = await ethers.getContractAt('Governance', await ctx.contracts.euler.moduleIdToProxy(moduleIds.GOVERNANCE));
    ctx.contracts.exec = await ethers.getContractAt('Exec', await ctx.contracts.euler.moduleIdToProxy(moduleIds.EXEC));


    if (ctx.tokenSetup.testing) {
        // Setup default ETokens/DTokens

        for (let tok of ctx.tokenSetup.testing.activated) {
            await ctx.activateMarket(tok);
        }

        for (let tok of ctx.tokenSetup.testing.tokens) {
            if (tok.config) {
                await ctx.setAssetConfig(ctx.contracts.tokens[tok.symbol].address, tok.config);
            }
        }
    }

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
            const { abi, bytecode, } = require('../vendor-artifacts/SwapRouter.json');
            ctx.SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
            ctx.contracts[name] = ctx.SwapRouterFactory.attach(addressManifest[name]);
        } else {
            ctx.contracts[name] = await ethers.getContractAt(instanceToContractName(name), addressManifest[name]);
        }
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
            ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

            let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
            ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
        }

        // Uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            const addr = await ctx.contracts.mockUniswapV3Factory.getPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee);

            ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
            ctx.contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

            let inverted = ethers.BigNumber.from(ctx.contracts.tokens[pair[0]].address).gt(ctx.contracts.tokens[pair[1]].address);
            ctx.uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = inverted;
            ctx.uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = !inverted;
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

async function getTaskCtx() {
    let filename = hre.network.name === 'localhost' ? './euler-addresses.json' : `./addresses/euler-addresses-${hre.network.name}.json`
    const eulerAddresses = JSON.parse(fs.readFileSync(filename));
    const ctx = await loadContracts(ethers.provider, await ethers.getSigners(), hre.network.name === 'localhost' ? 'testing' : hre.network.name, eulerAddresses);
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

        describe(this.args.desc || __filename, () => {
            let testNum = 0;
            for (let spec of this.tests) {
                it(spec.desc || `test #${testNum}`, async () => {
                    await this._runTest(spec);
                });

                testNum++;
            }
        });
    }

    async _runTest(spec) {
        let ctx;

        if (this.args.fixture === 'real-uniswap') ctx = await loadFixture(realUniswapTestingFixture);
        else ctx = await loadFixture(standardTestingFixture);

        let actions = [
            { action: 'checkpointTime', }
        ];

        if (this.args.preActions) actions = actions.concat(this.args.preActions(ctx));
        actions = actions.concat(spec.actions(ctx));

        for (let action of actions) {
            let err, result;

            try {
                result = await this._runAction(spec, ctx, action);
            } catch (e) {
                err = true;
                if (action.expectError) {
                    if (!e.message.match(action.expectError)) throw(`expected error "${action.expectError}" but instead got "${e.message}"`);
                } else {
                    throw(e);
                }
            }

            let makeBN = (x) => typeof(x) === 'number' ? ethers.BigNumber.from(x) : x;

            if (action.dump) console.log(dumpObj(result, 18));
            if (action.onResult) await action.onResult(result);

            if (action.assertEq !== undefined) expect(result).to.eql(makeBN(action.assertEq));
            if (action.assertEql !== undefined) expect(result).to.eql(makeBN(action.assertEql));
            if (action.equals !== undefined) {
                let args = action.equals;
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

        if (action.send !== undefined) {
            let components = action.send.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            let from = action.from || ctx.wallet;

            let tx = await contract.connect(from).functions[components[0]].apply(null, action.args);
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

            reportGas(result);
        } else if (action.action === 'sendBatch') {
            let items = action.batch.map(b => {
                let components = b.send.split('.');
                let contract = ctx.contracts;
                while (components.length > 1) contract = contract[components.shift()];

                return {
                    allowError: false,
                    proxyAddr: contract.address,
                    data: contract.interface.encodeFunctionData(components[0], b.args),
                };
            });

            let from = action.from || ctx.wallet;

            let tx = await ctx.contracts.exec.connect(from).batchDispatch(items, action.deferLiquidityChecks || []);
            let result = await tx.wait();
            if (action.dumpResult) console.log(dumpObj(result));

            // FIXME: report/detect errors

            reportGas(result);
        } else if (action.call !== undefined) {
            let components = action.call.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            return await contract[components[0]].apply(null, action.args);
        } else if (action.callStatic !== undefined) {
            let components = action.callStatic.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            return await contract.callStatic[components[0]].apply(null, action.args);
        } else if (action.action === 'cb' || action.cb) {
            await action.cb(ctx);
        } else if (action.action === 'activateMarket') {
            await ctx.activateMarket(action.tok);
        } else if (action.action === 'updateUniswapPrice') {
            await ctx.updateUniswapPrice(action.pair, action.price);
        } else if (action.action === 'doUniswapSwap') {
            let buy = action.dir === 'buy';

            if (ethers.BigNumber.from(ctx.contracts.tokens.WETH.address).lt(ctx.contracts.tokens[action.tok].address)) buy = !buy;

            if (buy) {
                let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact0For1(ctx.contracts.uniswapPools[`${action.tok}/WETH`].address, action.amount, (action.from || ctx.wallet).address, ratioToSqrtPriceX96(1, action.priceLimit));
                await tx.wait();
            } else {
                let tx = await ctx.contracts.simpleUniswapPeriphery.swapExact1For0(ctx.contracts.uniswapPools[`${action.tok}/WETH`].address, action.amount, (action.from || ctx.wallet).address, ratioToSqrtPriceX96(action.priceLimit, 1));
                await tx.wait();
            }
        } else if (action.action === 'getPrice') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.callStatic.getPriceFull(token.address);
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
    return ethers.BigNumber.from(primary).xor(subAccountId).toHexString();
}



function ratioToSqrtPriceX96(a, b) {
    return ethers.BigNumber.from(
               new bn(a.toString())
               .div(b.toString())
               .sqrt()
               .multipliedBy(new bn(2).pow(96))
               .integerValue(3)
               .toString()
           );
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
    standardTestingFixture,
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
    eth: (v) => ethers.utils.parseEther('' + v),
    units: (v, decimals) => ethers.utils.parseUnits('' + v, decimals),
    getSubAccount,
    ratioToSqrtPriceX96,
    c1e18: ethers.BigNumber.from(10).pow(18),
    c1e27: ethers.BigNumber.from(10).pow(27),

    // dev utils
    cleanupObj,
    dumpObj,

    // tasks
    taskUtils,
};
