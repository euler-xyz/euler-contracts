const hre = require("hardhat");
const { utils, Wallet } = require("zksync-web3");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { moduleIds, eth, contractNames, AddressZero, HashZero, writeAddressManifestToFile } = require("../test/lib/eTestLib");

const fs = require("fs");
const child_process = require("child_process");

const { Route, Pool, FeeAmount, TICK_SPACINGS, encodeRouteToPath, nearestUsableTick, TickMath } = require('@uniswap/v3-sdk');
const { Token, CurrencyAmount } = require('@uniswap/sdk-core');
const { ethers } = require("hardhat");

const defaultUniswapFee = FeeAmount.MEDIUM;

async function main() {
    
    // usage
    // NETWORK_NAME=testing-small npx hardhat run scripts/zkSync-setup.js --network zktestnet
    let networkName = process.env.NETWORK_NAME;
    
    const ctx = await deployContracts(networkName);

    writeAddressManifestToFile(ctx, `./euler-addresses-${networkName}.json`);
}

async function deployContracts(tokenSetupName) {

    let verification = {
        contracts: {
            tokens: {},
            oracles: {},
            modules: {},
            swapHandlers: {}
        },
    };

    // Initialize the wallet.
    const wallet = new Wallet(process.env.ZK_PRIVATE_KEY, hre.ethers.provider);

    // Create deployer object and load the 
    // artifact of the contract we want to deploy.
    const deployer = new Deployer(hre, wallet);

    let ctx = await buildContext(deployer, wallet, tokenSetupName);
    
    let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

   
    // Uni V3 router
    let swapRouterV2Address = AddressZero;
    let swapRouterV3Address = AddressZero;
    let swapRouter02Address = AddressZero;
    let oneInchAddress = AddressZero;

    if (ctx.tokenSetup.testing) {
        // Default tokens

        for (let token of (ctx.tokenSetup.testing.tokens || [])) {
            const artifact = await deployer.loadArtifact("TestERC20");
            const constructorArguments = [token.name, token.symbol, token.decimals, false];
            const contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
            ctx.contracts.tokens[token.symbol] = contract;
            verification.contracts.tokens[token.symbol] = contract.interface.encodeDeploy(constructorArguments);
        

            // if price oracle for the token is chainlink, 
            // deploy mock chainlink price oracle
            
            if (ctx.tokenSetup.testing.chainlinkOracles && ctx.tokenSetup.testing.chainlinkOracles.includes(token.symbol)) {
                const artifact = await deployer.loadArtifact("MockAggregatorProxy");
                const constructorArguments = [18];
                const contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
                ctx.contracts.oracles[token.symbol] = contract;
                verification.contracts.oracles[token.symbol] = contract.interface.encodeDeploy(constructorArguments);
            }
        }

        // Libraries and testing

        // FIX-ME: To setup real uniswap contracts with abi from zkSync compiler
        // we need to get the .sol files from uniswap repo so they have to be compiled by zksolc
        // if (ctx.tokenSetup.testing.useRealUniswap) {
        //     {
        //         const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Factory.json');
        //         ctx.uniswapV3FactoryFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
        //         ctx.contracts.uniswapV3Factory = await (await ctx.uniswapV3FactoryFactory.deploy()).deployed();
        //         verification.contracts.uniswapV3Factory = {
        //             address: ctx.contracts.uniswapV3Factory.address, args: []
        //         };
        //     }
        //     {
        //         const { abi, bytecode, } = require('../vendor-artifacts/SwapRouterV3.json');
        //         ctx.SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
        //         ctx.contracts.swapRouterV3 = await (await ctx.SwapRouterFactory.deploy(ctx.contracts.uniswapV3Factory.address, ctx.contracts.tokens['WETH'].address)).deployed();
        //         verification.contracts.swapRouterV3 = {
        //             address: ctx.contracts.swapRouterV3.address, args: [ctx.contracts.uniswapV3Factory.address, ctx.contracts.tokens['WETH'].address]
        //         };
        //     }
        //     {
        //         const { abi, bytecode, } = require('../vendor-artifacts/SwapRouter02.json');
        //         ctx.SwapRouter02Factory = new ethers.ContractFactory(abi, bytecode, ctx.wallet);
        //         ctx.contracts.swapRouter02 = await (await ctx.SwapRouter02Factory.deploy(
        //             AddressZero, // factoryV2 not needed
        //             ctx.contracts.uniswapV3Factory.address,
        //             AddressZero, // positionManager not needed
        //             ctx.contracts.tokens['WETH'].address
        //         )).deployed();
        //         verification.contracts.swapRouter02 = {
        //             address: ctx.contracts.swapRouter02.address, 
        //             args: [
        //                 AddressZero, 
        //                 ctx.contracts.uniswapV3Factory.address,
        //                 AddressZero, 
        //                 ctx.contracts.tokens['WETH'].address
        //             ]
        //         };
        //     }
        //     {
        //         const { abi, bytecode, } = require('../vendor-artifacts/UniswapV3Pool.json');
        //         ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
        //     }

        //     swapRouterV3Address = ctx.contracts.swapRouterV3.address;
        //     swapRouter02Address = ctx.contracts.swapRouter02.address;
        // } else {
        //     // FIX-ME: market activation with uniswap factory failing due to address computation issues with zkSync
        //     const artifact = await deployer.loadArtifact("MockUniswapV3Factory");
        //     const constructorArguments = [];
        //     const contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        //     ctx.contracts.uniswapV3Factory = contract;
        //     verification.contracts.uniswapV3Factory = contract.interface.encodeDeploy(constructorArguments);

        //     ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await deployer.loadArtifact("MockUniswapV3Pool")).bytecode);
        // }

        let artifact = await deployer.loadArtifact("InvariantChecker");
        let constructorArguments = [];
        let contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.invariantChecker = contract;
        verification.contracts.invariantChecker = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanNativeTest");
        constructorArguments = [];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.flashLoanNativeTest = contract;
        verification.contracts.flashLoanNativeTest = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanAdaptorTest");
        constructorArguments = [];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.flashLoanAdaptorTest = contract;
        verification.contracts.flashLoanAdaptorTest = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanAdaptorTest");
        constructorArguments = [];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.flashLoanAdaptorTest2 = contract;
        verification.contracts.flashLoanAdaptorTest2 = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("SimpleUniswapPeriphery");
        constructorArguments = [];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.simpleUniswapPeriphery = contract;
        verification.contracts.simpleUniswapPeriphery = contract.interface.encodeDeploy(constructorArguments);

        // Setup uniswap pairs

        // for (let pair of ctx.tokenSetup.testing.uniswapPools) {
        //     await ctx.createUniswapPool(pair, defaultUniswapFee);
        // }

        // FIX-ME: uncomment after above useRealUniswap branch is fixed
        // Initialize uniswap pools for tokens we will activate
        // if (ctx.tokenSetup.testing.useRealUniswap) {
        //     for (let tok of ctx.tokenSetup.testing.activated) {
        //         if (tok === 'WETH') continue;
        //         let config = ctx.tokenSetup.testing.tokens.find(t => t.symbol === tok)
        //          await ctx.contracts.uniswapPools[`${tok}/WETH`].initialize(
        //             ctx.poolAdjustedRatioToSqrtPriceX96(`${tok}/WETH`, 10**(18 - config.decimals),
        //             1,
        //         ));
        //     }
        // }
    }
 
    // Euler Contracts

    // Create module implementations

    let riskManagerSettings;

    if (ctx.tokenSetup.riskManagerSettings) {
        riskManagerSettings = ctx.tokenSetup.riskManagerSettings;

        // Deployment without Uniswap (Factory)
        if (riskManagerSettings.uniswapFactory === AddressZero) {
            riskManagerSettings = {
                referenceAsset: ctx.contracts.tokens['WETH'].address,
                uniswapFactory: AddressZero,
                uniswapPoolInitCodeHash: HashZero,
            };
        }
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

    let artifact = await deployer.loadArtifact("RiskManager");
    let constructorArguments = [gitCommit, riskManagerSettings];
    let contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.riskManager = contract;
    verification.contracts.modules.riskManager = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Installer");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.installer = contract;
    verification.contracts.modules.installer = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Markets");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.markets = contract;
    verification.contracts.modules.markets = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Liquidation");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.liquidation = contract;
    verification.contracts.modules.liquidation = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Governance");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.governance = contract;
    verification.contracts.modules.governance = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Exec");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.exec = contract;
    verification.contracts.modules.exec = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Swap");
    constructorArguments = [gitCommit, swapRouterV3Address, oneInchAddress];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.swap = contract;
    verification.contracts.modules.swap = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHub");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.swapHub = contract;
    verification.contracts.modules.swapHub = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("EToken");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.eToken = contract;
    verification.contracts.modules.eToken = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("DToken");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.dToken = contract;
    verification.contracts.modules.dToken = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("IRMDefault");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.modules.irmDefault = contract;
    verification.contracts.modules.irmDefault = contract.interface.encodeDeploy(constructorArguments);

    if (ctx.tokenSetup.testing) {
        let artifact = await deployer.loadArtifact("IRMZero");
        let constructorArguments = [gitCommit];
        let contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.modules.irmZero = contract;
        verification.contracts.modules.irmZero = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("IRMFixed");
        constructorArguments = [gitCommit];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.modules.irmFixed = contract;
        verification.contracts.modules.irmFixed = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("IRMLinear");
        constructorArguments = [gitCommit];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.modules.irmLinear = contract;
        verification.contracts.modules.irmLinear = contract.interface.encodeDeploy(constructorArguments);
    }

    // Create euler contract, which also installs the installer module and creates a proxy

    artifact = await deployer.loadArtifact("Euler");
    constructorArguments = [wallet.address, ctx.contracts.modules.installer.address];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.euler = contract;
    verification.contracts.euler = contract.interface.encodeDeploy(constructorArguments);

    
    // Create euler view contracts

    artifact = await deployer.loadArtifact("EulerSimpleLens");
    constructorArguments = [gitCommit, ctx.contracts.euler.address];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.eulerSimpleLens = contract;
    verification.contracts.eulerSimpleLens = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("DeltaBalances");
    constructorArguments = [];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.deltaBalances = contract;
    verification.contracts.deltaBalances = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("EulerGeneralView");
    constructorArguments = [gitCommit];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.eulerGeneralView = contract;
    verification.contracts.eulerGeneralView = contract.interface.encodeDeploy(constructorArguments);

    // Get reference to installer proxy
    artifact = await deployer.loadArtifact("Installer");
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

    artifact = await deployer.loadArtifact("SwapHandlerUniswapV3");
    constructorArguments = [swapRouterV3Address];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.swapHandlers.swapHandlerUniswapV3 = contract;
    verification.contracts.swapHandlers.swapHandlerUniswapV3 = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHandler1Inch");
    constructorArguments = [oneInchAddress, swapRouterV2Address, swapRouterV3Address];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.swapHandlers.swapHandler1Inch = contract;
    verification.contracts.swapHandlers.swapHandler1Inch = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHandlerUniAutoRouter");
    constructorArguments = [swapRouter02Address, swapRouterV2Address, swapRouterV3Address];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.swapHandlers.swapHandlerUniAutoRouter = contract;
    verification.contracts.swapHandlers.swapHandlerUniAutoRouter = contract.interface.encodeDeploy(constructorArguments);

    if (ctx.tokenSetup.testing) {
        // Setup default ETokens/DTokens

        for (let tok of ctx.tokenSetup.testing.activated) {
            if (ctx.tokenSetup.testing.chainlinkOracles && ctx.tokenSetup.testing.chainlinkOracles.includes(tok)) {
                await ctx.activateMarketWithChainlinkPriceFeed(tok, ctx.contracts.oracles[tok].address);
                if (ctx.tokenSetup.testing.chainlinkPrices[tok]) {
                    await ctx.contracts.oracles[tok].connect(ctx.wallet).mockSetValidAnswer(eth(ctx.tokenSetup.testing.chainlinkPrices[tok].toString()));
                }
            } else {
                // FIX-ME: only used for reference asset
                // failing for other tokens/markets due to address computation issues with zkSync
                await ctx.activateMarket(tok);
            }
        }
        
        for (let tok of (ctx.tokenSetup.testing.tokens || [])) {
            if (tok.config) {
                if (!ctx.tokenSetup.testing.activated.find(s => s === tok.symbol)) throw(`can't set config for unactivated asset: ${tok.symbol}`);
                await ctx.setAssetConfig(ctx.contracts.tokens[tok.symbol].address, tok.config);
            }
        }
    }

    // Setup adaptors

    artifact = await deployer.loadArtifact("FlashLoan");
    constructorArguments = [
        ctx.contracts.euler.address,
        ctx.contracts.exec.address,
        ctx.contracts.markets.address,
    ];
    contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
    ctx.contracts.flashLoan = contract;
    verification.contracts.flashLoan = contract.interface.encodeDeploy(constructorArguments);

    // Setup liquidity mining contracts

    if (ctx.contracts.tokens.EUL) {
        let artifact = await deployer.loadArtifact("EulStakes");
        let constructorArguments = [
            ctx.contracts.tokens.EUL.address
        ];
        let contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.eulStakes = contract;
        verification.contracts.eulStakes = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("EulDistributor");
        constructorArguments = [
            ctx.contracts.tokens.EUL.address,
            ctx.contracts.eulStakes.address,
        ];
        contract = await (await deployer.deploy(artifact, constructorArguments)).deployed();
        ctx.contracts.eulDistributor = contract;
        verification.contracts.eulDistributor = contract.interface.encodeDeploy(constructorArguments);
    }

    // export verification json file for zkSync smart contract verification UI
    let outputJson = JSON.stringify(verification, ' ', 4);
    fs.writeFileSync(`./euler-contracts-verification-${tokenSetupName}.json`, outputJson + "\n");

    return ctx;
}



async function buildContext(deployer, wallet, tokenSetupName) {
    let ctx = {
        moduleIds,
        wallet: wallet,

        contracts: {
            tokens: {},
            oracles: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
            modules: {},
            swapHandlers: {}
        },

        uniswapPoolsInverted: {},
    };

    // Token Setup
    ctx.tokenSetup = require(`../test/lib/token-setups/${tokenSetupName}`);

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

    ctx.activateMarket = async (tok) => {
        let result = await (await ctx.contracts.markets.connect(ctx.wallet).activateMarket(ctx.contracts.tokens[tok].address)).wait();
        if (process.env.GAS) console.log(`GAS(activateMarket) : ${result.gasUsed}`);

        let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens[tok].address);
        ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

        let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
        ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
    };

    ctx.activateMarketWithChainlinkPriceFeed = async (tok, oracleAddress) => {
        let result = await (await ctx.contracts.markets.connect(ctx.wallet).activateMarketWithChainlinkPriceFeed(ctx.contracts.tokens[tok].address, oracleAddress)).wait();
        if (process.env.GAS) console.log(`GAS(activateMarketWithChainlinkPriceFeed) : ${result.gasUsed}`);

        let eTokenAddr = await ctx.contracts.markets.underlyingToEToken(ctx.contracts.tokens[tok].address);
        ctx.contracts.eTokens['e' + tok] = await ethers.getContractAt('EToken', eTokenAddr);

        let dTokenAddr = await ctx.contracts.markets.eTokenToDToken(eTokenAddr);
        ctx.contracts.dTokens['d' + tok] = await ethers.getContractAt('DToken', dTokenAddr);
    };

    return ctx;
}


main();