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

    IRM_ZERO: 2000000,
    IRM_FIXED: 2000001,
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
    'IRMZero',
    'IRMFixed',
    'IRMLinear',
    'IRMLinearRecursive',

    // Testing

    'TestERC20',
    'MockUniswapV3Factory',
    'EulerGeneralView',
    'InvariantChecker',
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


const defaultUniswapFee = 500;



async function buildContext(provider, wallets, tokenSetupName) {
    let ctx = {
        provider,
        wallet: wallets[0],
        wallet2: wallets[1],
        wallet3: wallets[2],
        wallet4: wallets[3],

        contracts: {
            tokens: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
            modules: {},
        },

        uniswapPoolsInverted: {},
    }


    // Token Setup

    ctx.tokenSetup = require(`./token-setups/${tokenSetupName}`);



    // Contract factories

    ctx.factories = {};

    for (let c of contractNames) {
        ctx.factories[c] = await ethers.getContractFactory(c);
    }


    // Time routines

    ctx.startTime = (await provider.getBlock()).timestamp;
    ctx._lastJumpTime = ctx.startTime;

    ctx.checkpointTime = async () => {
        ctx._lastJumpTime = (await provider.getBlock()).timestamp;
    };

    ctx.jumpTime = async (offset) => {
        // Only works on hardhat EVM
        ctx._lastJumpTime += offset;
        await provider.send("evm_setNextBlockTimestamp", [ctx._lastJumpTime]);
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
        let b = ethers.utils.parseUnits(price, decimals);
        let poolContract = ctx.contracts.uniswapPools[pair];
        if (!poolContract) throw(Error(`Unknown pair: ${pair}`));

        if (ctx.uniswapPoolsInverted[pair]) [a, b] = [b, a];

        let sqrtPriceX96 = ethers.BigNumber.from(
                               new bn(a.toString())
                               .div(b.toString())
                               .sqrt()
                               .multipliedBy(new bn(2).pow(96))
                               .integerValue(3)
                               .toString()
                           );

        await (await poolContract.mockSetTwap(sqrtPriceX96)).wait();
    };


    // Modules

    ctx.setIRM = async (underlying, irm, resetParams) => {
        await (await ctx.contracts.governance.connect(ctx.wallet).setIRM(underlying, irm, resetParams)).wait();
    };


    return ctx;
}





async function standardTestingFixture(_, provider) {
    let wallets = await ethers.getSigners();

    let addressManifest;

    {
        let ctx = await deployContracts(provider, wallets, 'testing');

        addressManifest = exportAddressManifest(ctx);
    }

    if (process.env.VERBOSE) console.log(addressManifest);

    let ctx = await loadContracts(provider, wallets, 'testing', addressManifest);

    return ctx;
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

    // Tokens

    for (let token of ctx.tokenSetup.tokens) {
        ctx.contracts.tokens[token.symbol] = await (await ctx.factories.TestERC20.deploy(token.name, token.symbol, token.decimals)).deployed();
    }

    // Libraries and testing

    ctx.contracts.mockUniswapV3Factory = await (await ctx.factories.MockUniswapV3Factory.deploy()).deployed();
    ctx.contracts.eulerGeneralView = await (await ctx.factories.EulerGeneralView.deploy()).deployed();
    ctx.contracts.invariantChecker = await (await ctx.factories.InvariantChecker.deploy()).deployed();

    // Setup uniswap pairs

    for (let pair of ctx.tokenSetup.uniswapPools) {
        await (await ctx.contracts.mockUniswapV3Factory.createPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee)).wait();
        const addr = await ctx.contracts.mockUniswapV3Factory.getPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee);

        ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
        ctx.contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

        let inverted = ethers.BigNumber.from(ctx.contracts.tokens[pair[0]].address).gt(ctx.contracts.tokens[pair[1]].address);
        ctx.uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = inverted;
        ctx.uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = !inverted;
    }





    // Euler Contracts

    // Create module implementations

    ctx.contracts.modules.installer = await (await ctx.factories.Installer.deploy()).deployed();
    ctx.contracts.modules.markets = await (await ctx.factories.Markets.deploy()).deployed();
    ctx.contracts.modules.liquidation = await (await ctx.factories.Liquidation.deploy()).deployed();
    ctx.contracts.modules.governance = await (await ctx.factories.Governance.deploy()).deployed();
    ctx.contracts.modules.exec = await (await ctx.factories.Exec.deploy()).deployed();
    ctx.contracts.modules.eToken = await (await ctx.factories.EToken.deploy()).deployed();
    ctx.contracts.modules.dToken = await (await ctx.factories.DToken.deploy()).deployed();

    let riskManagerSettings = {
        referenceAsset: ctx.contracts.tokens['WETH'].address,
        uniswapFactory: ctx.contracts.mockUniswapV3Factory.address,
        uniswapPoolInitCodeHash: ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode),
    };

    ctx.contracts.modules.riskManager = await (await ctx.factories.RiskManager.deploy(riskManagerSettings)).deployed();
    ctx.contracts.modules.irmZero = await (await ctx.factories.IRMZero.deploy()).deployed();
    ctx.contracts.modules.irmFixed = await (await ctx.factories.IRMFixed.deploy()).deployed();
    ctx.contracts.modules.irmLinear = await (await ctx.factories.IRMLinear.deploy()).deployed();
    ctx.contracts.modules.irmLinearRecursive = await (await ctx.factories.IRMLinearRecursive.deploy()).deployed();


    // Create euler contract, which also installs the installer module

    ctx.contracts.euler = await (await ctx.factories.Euler.deploy(ctx.wallet.address, ctx.contracts.modules.installer.address)).deployed();

    // Create proxies for installer module and other singleton modules
    // This must directly send a message to the euler dispatcher, since no proxies have been created yet!

    {
        let proxiesToCreate = [
            {
                name: 'installer',
                contract: 'Installer',
                moduleId: moduleIds.INSTALLER,
            },
            {
                name: 'markets',
                contract: 'Markets',
                moduleId: moduleIds.MARKETS,
            },
            {
                name: 'liquidation',
                contract: 'Liquidation',
                moduleId: moduleIds.LIQUIDATION,
            },
            {
                name: 'governance',
                contract: 'Governance',
                moduleId: moduleIds.GOVERNANCE,
            },
            {
                name: 'exec',
                contract: 'Exec',
                moduleId: moduleIds.EXEC,
            },
        ];

        let input = ctx.contracts.modules.installer.interface.encodeFunctionData("createProxies", [proxiesToCreate.map(p => p.moduleId)]);
        let res;

        {
            let data = ethers.utils.hexlify(ethers.utils.concat([
                           '0xe9c4a3ac', // dispatch() selector
                           input,
                           ethers.constants.HashZero, // msg.sender -- not needed for bootstrap
                           ethers.utils.hexZeroPad(moduleIds.INSTALLER, 32),
                       ]));

            res = await (await ctx.wallet.sendTransaction({ to: ctx.contracts.euler.address, data, })).wait();
        }

        for (let i = 0; i < proxiesToCreate.length; i++) {
            let parsedLog = ctx.contracts.modules.installer.interface.parseLog(res.logs[i]);
            ctx.contracts[proxiesToCreate[i].name] = await ethers.getContractAt(proxiesToCreate[i].contract, parsedLog.args.proxy);
        }
    }

    // Now we can install the remaining modules using the installer proxy.

    {
        let modulesToInstall = [
            {
                moduleId: moduleIds.MARKETS,
                implementation: ctx.contracts.modules.markets.address,
            },
            {
                moduleId: moduleIds.LIQUIDATION,
                implementation: ctx.contracts.modules.liquidation.address,
            },
            {
                moduleId: moduleIds.GOVERNANCE,
                implementation: ctx.contracts.modules.governance.address,
            },
            {
                moduleId: moduleIds.EXEC,
                implementation: ctx.contracts.modules.exec.address,
            },
            {
                moduleId: moduleIds.ETOKEN,
                implementation: ctx.contracts.modules.eToken.address,
            },
            {
                moduleId: moduleIds.DTOKEN,
                implementation: ctx.contracts.modules.dToken.address,
            },
            // Internal
            {
                moduleId: moduleIds.RISK_MANAGER,
                implementation: ctx.contracts.modules.riskManager.address,
            },
            // IRMs
            {
                moduleId: moduleIds.IRM_ZERO,
                implementation: ctx.contracts.modules.irmZero.address,
            },
            {
                moduleId: moduleIds.IRM_FIXED,
                implementation: ctx.contracts.modules.irmFixed.address,
            },
            {
                moduleId: moduleIds.IRM_LINEAR,
                implementation: ctx.contracts.modules.irmLinear.address,
            },
            {
                moduleId: moduleIds.IRM_LINEAR_RECURSIVE,
                implementation: ctx.contracts.modules.irmLinearRecursive.address,
            },
        ];

        await (await ctx.contracts.installer.connect(ctx.wallet).install(modulesToInstall)).wait();
    }



    // Default ETokens/DTokens

    for (let tok of ctx.tokenSetup.activated) {
        let result = await (await ctx.contracts.markets.activateMarket(ctx.contracts.tokens[tok].address)).wait();
        if (process.env.GAS) console.log(`GAS(activateMarket) : ${result.gasUsed}`);

        let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens[tok].address);
        ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

        let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
        ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
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
        ctx.contracts[name] = await ethers.getContractAt(instanceToContractName(name), addressManifest[name]);
    }

    // Modules

    for (let name of Object.keys(addressManifest.modules)) {
        ctx.contracts.modules[name] = await ethers.getContractAt(instanceToContractName(name), addressManifest.modules[name]);
    }

    // Tokens/eTokens/dTokens

    for (let tok of Object.keys(addressManifest.tokens)) {
        ctx.contracts.tokens[tok] = await ethers.getContractAt('TestERC20', addressManifest.tokens[tok]);

        let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(addressManifest.tokens[tok]);
        ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

        let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
        ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
    }

    // Uniswap pairs

    for (let pair of ctx.tokenSetup.uniswapPools) {
        const addr = await ctx.contracts.mockUniswapV3Factory.getPool(ctx.contracts.tokens[pair[0]].address, ctx.contracts.tokens[pair[1]].address, defaultUniswapFee);

        ctx.contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
        ctx.contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

        let inverted = ethers.BigNumber.from(ctx.contracts.tokens[pair[0]].address).gt(ctx.contracts.tokens[pair[1]].address);
        ctx.uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = inverted;
        ctx.uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = !inverted;
    }

    return ctx;
}


async function getScriptCtx(tokenSetupName) {
    const eulerAddresses = JSON.parse(fs.readFileSync('./euler-addresses.json'));
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
        const ctx = await loadFixture(standardTestingFixture);

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
            if (action.onResult) action.onResult(result);

            if (action.assertEq) expect(result).to.eql(makeBN(action.assertEq));
            if (action.assertEql) expect(result).to.eql(makeBN(action.assertEql));
            if (action.equals) {
                let args = action.equals;
                if (!Array.isArray(args)) args = [args];
                equals(result, args[0], args[1]);
            }
            if (action.assertResult) action.assertResult(result);

            if (action.expectError && !err) throw(`expected error "${action.expectError}" but no error was thrown`);

            if ((process.env.INVARIANTS && action.send) || action.invariants) {
                let markets = ['TST', 'TST2', 'TST3', 'TST6', 'TST9'].map(m => ctx.contracts.tokens[m].address);
                let accounts = [ctx.wallet.address, ctx.wallet2.address, ctx.wallet3.address, ctx.wallet4.address];

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

        if (action.send !== undefined) {
            let components = action.send.split('.');
            let contract = ctx.contracts;
            while (components.length > 1) contract = contract[components.shift()];

            let from = action.from || ctx.wallet;

            let tx = await contract.connect(from).functions[components[0]].apply(null, action.args);
            let result = await tx.wait();
            if (action.dumpResult) console.log(dumpObj(result));

            for (let log of result.logs) {
                let parsedLog;

                try {
                    parsedLog = contract.interface.parseLog(log);
                } catch(e) {
                    continue;
                }

                if (parsedLog.name === 'Error') throw(Error(parsedLog.args.reason));
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
        } else if (action.action === 'cb') {
            action.cb();
        } else if (action.action === 'updateUniswapPrice') {
            await ctx.updateUniswapPrice(action.pair, action.price);
        } else if (action.action === 'getPrice') {
            let token = ctx.contracts.tokens[action.underlying];
            return await ctx.contracts.exec.callStatic.getPrice(token.address);
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



function equals(val, expected, tolerance) {
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




module.exports = {
    testSet,

    // default fixtures
    standardTestingFixture,
    deployContracts,
    loadContracts,
    exportAddressManifest,
    writeAddressManifestToFile,
    getScriptCtx,
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
    BN: ethers.BigNumber.from,
    eth: (v) => ethers.utils.parseEther('' + v),
    units: (v, decimals) => ethers.utils.parseUnits('' + v, decimals),
    getSubAccount,
    c1e18: ethers.BigNumber.from(10).pow(18),
    c1e27: ethers.BigNumber.from(10).pow(27),

    // dev utils
    cleanupObj,
    dumpObj,
};
