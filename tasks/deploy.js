const fs = require('fs');
const child_process = require("child_process");
const { ratioToSqrtPriceX96, sqrtPriceX96ToPrice, } = require("../test/lib/sqrtPriceUtils.js");

const testnets = ['goerli'];
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

    // Liquidity Mining

    'EulStakes',
    'EulDistributor',

    // Testing

    'TestERC20',
    'MockUniswapV3Factory',
    'EulerGeneralView',
    'EulerSimpleLens',
    'InvariantChecker',
    'FlashLoanNativeTest',
    'FlashLoanAdaptorTest',
    'SimpleUniswapPeriphery',
    'TestModule',
    'MockAggregatorProxy'
];

task("deploy:update", "Update the current state of Euler smart contracts and markets")
    .setAction(async () => {
        const networkName = network.name;

        const defaultUniswapFee = 3000;
        const PRICINGTYPE__UNISWAP3_TWAP = 2;
        const PRICINGTYPE__CHAINLINK = 4;

        // Configuration
        const config = require(`../scripts/templates/goerli`);
        // TODO revert to below line for ethereum network
        // const config = require(`../scripts/templates/${networkName}`);

        const outputFilePath = `../addresses/euler-addresses-${networkName}.json`;
        let currentState;
        try {
            currentState = require(outputFilePath);
        }  catch(err) {
            throw Error(`No deployment file found for network ${networkName}`);
        }

        let contracts = {
            tokens: {},
            modules: {},
            chainlinkOracles: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
        };

        contracts.euler = contracts.installer = await ethers.getContractAt('Euler', currentState.euler);

        let factories = {};

        let output = {
            tokens: {},
            modules: {},
            chainlinkOracles: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
        };

        // const provider = await ethers.provider;
        const signers = await ethers.getSigners();
        const deployer = signers[0];

        let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

        console.log('Initialising smart contract factories......\n');


        console.log('deploying the following', config.contracts);
        console.log('installing the following', config.modules);

        for (let c of config.contracts) {
            factories[c] = await ethers.getContractFactory(c);
        }
        factories.MockAggregatorProxy = await ethers.getContractFactory('MockAggregatorProxy');

        console.log(`Deploying to ${networkName} with Git Commit ${gitCommit} via Signer ${deployer.address}......\n`);

        let swapRouterAddress = ethers.constants.AddressZero;
        let oneInchAddress = ethers.constants.AddressZero;

        if (config.testing && testnets.includes(networkName)) {
            if (config.contracts.includes('IRMZero')) {
                contracts.modules.irmZero = await (await factories.IRMZero.deploy(gitCommit)).deployed();
                output.modules.irmZero = contracts.modules.irmZero.address;
                await verifyContract(contracts.modules.irmZero.address, [gitCommit]);
                console.log(`Deployed IRMZero module at: ${contracts.modules.irmZero.address}`);
            }

            if (config.contracts.includes('IRMFixed')) {
                contracts.modules.irmFixed = await (await factories.IRMFixed.deploy(gitCommit)).deployed();
                output.modules.irmFixed = contracts.modules.irmFixed.address;
                await verifyContract(contracts.modules.irmFixed.address, [gitCommit]);
                console.log(`Deployed IRMFixed module at: ${contracts.modules.irmFixed.address}`);
            }

            if (config.contracts.includes('IRMLinear')) {
                contracts.modules.irmLinear = await (await factories.IRMLinear.deploy(gitCommit)).deployed();
                output.modules.irmFixed = contracts.modules.irmFixed.address;
                await verifyContract(contracts.modules.irmFixed.address, [gitCommit]);
                console.log(`Deployed IRMLinear module at: ${contracts.modules.irmLinear.address}`);
            }

            // Deploy test tokens
            for (let token of (config.testing.tokens || [])) {
                if (currentState.tokens[token.symbol] === undefined) {
                    contracts.tokens[token.symbol] = await (await factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
                    output.tokens[token.symbol] = contracts.tokens[token.symbol].address;
                    await verifyContract(contracts.tokens[token.symbol].address, [token.name, token.symbol, token.decimals, false]);
                    console.log(`Deployed ERC20 Token ${token.symbol} at: ${contracts.tokens[token.symbol].address}`);
                }
                // Deploy test chainlink price oracles with ETH
                // if current deployment pricing type is not chainlink
                if (token.config.pricingType === PRICINGTYPE__CHAINLINK && currentState.uniswapPools[token.symbol]) {
                    contracts.chainlinkOracles[token.symbol] = await (await factories.MockAggregatorProxy.deploy(18)).deployed();
                    output.chainlinkOracles[token.symbol] = contracts.chainlinkOracles[token.symbol].address;
                    await verifyContract(contracts.chainlinkOracles[token.symbol].address, [18]);
                    console.log(`Deployed ERC20 Token ${token.symbol} Chainlink Price Oracle at: ${contracts.chainlinkOracles[token.symbol].address}`);
                }

            }

            if (currentState.InvariantChecker === undefined) {
                factories.InvariantChecker = await ethers.getContractFactory('InvariantChecker');
                contracts.invariantChecker = await (await factories.InvariantChecker.deploy()).deployed();
                await verifyContract(contracts.invariantChecker.address, []);
                output.invariantChecker = contracts.invariantChecker.address;
            }

            if (currentState.FlashLoanNativeTest === undefined) {
                factories.FlashLoanNativeTest = await ethers.getContractFactory('FlashLoanNativeTest');
                contracts.flashLoanNativeTest = await (await factories.FlashLoanNativeTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanNativeTest.address, []);
                output.flashLoanNativeTest = contracts.flashLoanNativeTest.address;
            }

            if (currentState.FlashLoanAdaptorTest === undefined) {
                factories.FlashLoanAdaptorTest = await ethers.getContractFactory('FlashLoanAdaptorTest');
                contracts.flashLoanAdaptorTest = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanAdaptorTest.address, []);
                output.flashLoanAdaptorTest = contracts.flashLoanAdaptorTest.address;    
            }

            if (currentState.FlashLoanAdaptorTest2 === undefined) {
                factories.FlashLoanAdaptorTest = await ethers.getContractFactory('FlashLoanAdaptorTest');
                contracts.flashLoanAdaptorTest2 = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanAdaptorTest2.address, []);
                output.flashLoanAdaptorTest2 = contracts.flashLoanAdaptorTest2.address;
            }

            if (currentState.SimpleUniswapPeriphery === undefined) {
                factories.SimpleUniswapPeriphery = await ethers.getContractFactory('SimpleUniswapPeriphery');
                contracts.simpleUniswapPeriphery = await (await factories.SimpleUniswapPeriphery.deploy()).deployed();
                await verifyContract(contracts.simpleUniswapPeriphery.address, []);
                output.simpleUniswapPeriphery = contracts.simpleUniswapPeriphery.address;
            }
        }

        if (config.existingContracts) {
            if (config.existingContracts.swapRouter) swapRouterAddress = config.existingContracts.swapRouter;
            if (config.existingContracts.oneInch) oneInchAddress = config.existingContracts.oneInch;
            if (config.existingContracts.eulToken) eul = config.existingContracts.eulToken;
        }

        // Deploy Contracts using gitcommit
        for (let contract of config.contracts) {
            try {
                contracts[contract] = await (await factories[contract].deploy(gitCommit)).deployed();
                console.log(`Deployed ${contract} at: ${contracts[contract].address}`);
                await verifyContract(contracts[contract].address, [gitCommit]);
                output[`${contract.charAt(0).toLowerCase() + contract.slice(1)}`] = contracts[contract].address;
            } catch (e) {
                console.log(`Could not deploy ${contract} with single gitCommit parameter`)
            }
        }

        if (config.contracts.includes('Swap')) {
            contracts.swap = await (await factories.Swap.deploy(gitCommit, swapRouterAddress, oneInchAddress)).deployed();
            output.swap = contracts.swap.address;
            await verifyContract(contracts.swap.address, [gitCommit, swapRouterAddress, oneInchAddress]);
            console.log(`Deployed Swap module at: ${contracts.swap.address}`);
        }

        if (config.contracts.includes('RiskManager')) {
            contracts.riskManager = await (await factories.RiskManager.deploy(gitCommit, riskManagerSettings)).deployed();
            output.riskManager = contracts.risikManager.address;
            await verifyContract(contracts.riskManager.address, [gitCommit, riskManagerSettings]);
            console.log(`Deployed RiskManager module at: ${contracts.riskManager.address}`);
        }

        if (config.contracts.includes('EulerSimpleLens')) {
            contracts.eulerSimpleLens = await (await factories.EulerSimpleLens.deploy(gitCommit, contracts.euler.address)).deployed();
            output.eulerSimpleLens = contracts.eulerSimpleLens.address;
            await verifyContract(contracts.eulerSimpleLens.address, [gitCommit, contracts.euler.address]);
            console.log(`Deployed EulerSimpleLens at: ${contracts.eulerSimpleLens.address}`);
        }

        // Get reference to installer proxy

        contracts.installer = await ethers.getContractAt('Installer', await contracts.euler.moduleIdToProxy(moduleIds.INSTALLER));
        console.log(`Deployed Installer Proxy at: ${contracts.installer.address}`);

        // Install the remaining modules
        let modules = [
            'markets',
            'liquidation',
            'governance',
            'exec',
            'swap',

            'eToken',
            'dToken',

            'riskManager',

            'irmDefault',

            'irmZero',
            'irmFixed',
            'irmLinear',
        ];

        for (let contract of config.contracts) {
            for (let module of modules) {
                if (module.toLowerCase() === contract.toLowerCase()) {
                    let moduleAddrs = contracts.modules[contract] === undefined ? contracts[contract].address : contracts.modules[contract].address;
                    await (await contracts.installer.connect(deployer).installModules([moduleAddrs])).wait();
                    output.modules[module] = (await ethers.getContractAt(contract, await contracts.euler.moduleIdToProxy(moduleIds[contract.toUpperCase()]))).address;
                }
            }
        }

        // Activate test markets, setup pricing params, Setup default ETokens/DTokens
        if (config.testing && testnets.includes(networkName)) {
            // Setup default ETokens/DTokens
            for (let token of (config.testing.tokens || [])) {
                if (currentState.tokens[token.symbol] == undefined) {
                    await (await contracts.markets.connect(deployer).activateMarket(contracts.tokens[token.symbol])).wait();
                    let eTokenAddr = await contracts.markets.underlyingToEToken(contracts.tokens[token.symbol]);
                    let dTokenAddr = await contracts.markets.underlyingToDToken(contracts.tokens[token.symbol]);
                    output.eTokens[token.symbol] = eTokenAddr;
                    output.dTokens[token.symbol] = dTokenAddr;
                }

            }

            contracts.markets = await ethers.getContractAt('Markets', currentState.modules.markets);

            for (let token of (config.testing.tokens || [])) {
                if (token.config) {
                    // Setup asset configuration
                    if (!config.testing.activated.find(s => s === token.symbol)) throw Error(`Unable to set config for unactivated asset: ${token.symbol}`);

                    if (currentState.tokens[token.symbol] === undefined) {
                        let assetConfig = await contracts.markets.underlyingToAssetConfigUnresolved(contracts.tokens[token.symbol].address);
                        let newConfig = token.config;
                        assetConfig = {
                            eTokenAddress: assetConfig.eTokenAddress,
                            borrowIsolated: assetConfig.borrowIsolated,
                            collateralFactor: assetConfig.collateralFactor,
                            borrowFactor: assetConfig.borrowFactor,
                            twapWindow: assetConfig.twapWindow,
                        };
                        if (newConfig.collateralFactor !== undefined) assetConfig.collateralFactor = Math.floor(newConfig.collateralFactor * 4000000000);
                        if (newConfig.borrowFactor !== undefined) assetConfig.borrowFactor = Math.floor(newConfig.borrowFactor * 4000000000);
                        if (newConfig.borrowIsolated !== undefined) assetConfig.borrowIsolated = newConfig.borrowIsolated;
                        if (newConfig.twapWindow !== undefined) assetConfig.twapWindow = newConfig.twapWindow;
                        if (newConfig.borrowFactor === 'default') newConfig.borrowFactor = 4294967295;
                        if (newConfig.twapWindow === 'default') newConfig.twapWindow = 16777215;

                        await (await contracts.governance.connect(deployer).setAssetConfig(contracts.tokens[token.symbol].address, assetConfig)).wait();

                        if (token.config.pricingType === PRICINGTYPE__CHAINLINK && token.config.price && currentState.uniswapPools[token.symbol]) {
                            // Setup chainlink price feed address
                            await (await contracts.governance.connect(deployer).setChainlinkPriceFeed(contracts.tokens[token.symbol].address, contracts.chainlinkOracles[token.symbol].address)).wait();
                            // Setup pricing configuration
                            await (await contracts.governance.connect(deployer).setPricingConfig(contracts.tokens[token.symbol].address, PRICINGTYPE__CHAINLINK, defaultUniswapFee)).wait();
                            // Setup chainlink prices
                            await (await contracts.chainlinkOracles[token.symbol].mockSetValidAnswer(ethers.utils.parseEther(`${token.config.price}`))).wait();
                        }
                    }
                }
            }
        }

        // Setup adaptors
        if (config.contracts.includes('FlashLoan')) {
            contracts.flashLoan = await (await factories.FlashLoan.deploy(
                contracts.euler.address,
                contracts.exec.address,
                contracts.markets.address,
            )).deployed();
            output.flashLoan = contracts.flashLoan.address;
            await verifyContract(contracts.flashLoan.address, [
                contracts.euler.address,
                contracts.exec.address,
                contracts.markets.address]);
            console.log(`Deployed FlashLoan at: ${contracts.flashLoan.address}`);
        }   

        console.log(output);

        // todo verify contracts
    });

task("deploy", "Full deploy of Euler smart contracts and specified test markets")
    .setAction(async () => {
        try {
            if (!process.env.ETHERSCAN_API_KEY) {
                throw Error("Required process.env.ETHERSCAN_API_KEY variable not found.");
            }

            const networkName = network.name;

            const defaultUniswapFee = 3000;
            const PRICINGTYPE__UNISWAP3_TWAP = 2;
            const PRICINGTYPE__CHAINLINK = 4;

            // Configuration
            const config = require(`../scripts/templates/goerli`);
            // TODO revert to below line for ethereum network
            // const config = require(`../scripts/templates/${networkName}`);

            // TODO verify the contracts on etherscan

            let uniswapPoolsInverted = {};

            let contracts = {
                tokens: {},
                modules: {},
                chainlinkOracles: {},
                eTokens: {},
                dTokens: {},
                uniswapPools: {},
            };

            let contractAddresses = {};

            let factories = {};

            // const provider = await ethers.provider;
            const signers = await ethers.getSigners();
            const deployer = signers[0];

            let gitCommit = ethers.utils.hexZeroPad('0x' + child_process.execSync('git rev-parse HEAD').toString().trim(), 32);

            console.log('Initialising smart contract factories......\n');

            for (let c of contractNames) {
                factories[c] = await ethers.getContractFactory(c);
            }

            console.log(`Deploying to ${networkName} with Git Commit ${gitCommit} via Signer ${deployer.address}......\n`);

            let uniswapV3PoolByteCodeHash;
            let swapRouterAddress = ethers.constants.AddressZero;
            let oneInchAddress = ethers.constants.AddressZero;
            let eul = ethers.constants.AddressZero;

            if (config.testing && testnets.includes(networkName)) {
                contracts.modules.irmZero = await (await factories.IRMZero.deploy(gitCommit)).deployed();
                await verifyContract(contracts.modules.irmZero.address, [gitCommit]);
                console.log(`Deployed IRMZero module at: ${contracts.modules.irmZero.address}`);

                contracts.modules.irmFixed = await (await factories.IRMFixed.deploy(gitCommit)).deployed();
                await verifyContract(contracts.modules.irmFixed.address, [gitCommit]);
                console.log(`Deployed IRMFixed module at: ${contracts.modules.irmFixed.address}`);

                contracts.modules.irmLinear = await (await factories.IRMLinear.deploy(gitCommit)).deployed();
                await verifyContract(contracts.modules.irmLinear.address, [gitCommit]);
                console.log(`Deployed IRMLinear module at: ${contracts.modules.irmLinear.address}`);

                // Deploy test tokens
                for (let token of (config.testing.tokens || [])) {
                    contracts.tokens[token.symbol] = await (await factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
                    await verifyContract(contracts.tokens[token.symbol].address, [token.name, token.symbol, token.decimals, false]);
                    console.log(`Deployed ERC20 Token ${token.symbol} at: ${contracts.tokens[token.symbol].address}`);

                    // Deploy test chainlink price oracles with ETH
                    // if pricing type is chainlink
                    if (token.config.pricingType === PRICINGTYPE__CHAINLINK) {
                        contracts.chainlinkOracles[token.symbol] = await (await factories.MockAggregatorProxy.deploy(18)).deployed();
                        await verifyContract(contracts.chainlinkOracles[token.symbol].address, [18]);
                        console.log(`Deployed ERC20 Token ${token.symbol} Chainlink Price Oracle at: ${contracts.chainlinkOracles[token.symbol].address}`);
                    }

                }

                if (config.testing.useRealUniswap) {
                    console.log("Deploying Uniswap Contracts....");
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/UniswapV3Factory.json");
                        const uniswapV3FactoryFactory = new ethers.ContractFactory(abi, bytecode, deployer);
                        contracts.uniswapV3Factory = await (await uniswapV3FactoryFactory.deploy()).deployed();
                        await verifyContract(contracts.uniswapV3Factory.address, []);
                    }
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/SwapRouter.json");
                        const SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, deployer);
                        contracts.swapRouter = await (await SwapRouterFactory.deploy(contracts.uniswapV3Factory.address, contracts.tokens['WETH'].address)).deployed();
                        swapRouterAddress = contracts.swapRouter.address;
                        await verifyContract(swapRouterAddress, [contracts.uniswapV3Factory.address, contracts.tokens['WETH'].address]);
                    }
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/UniswapV3Pool.json");
                        uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
                    }

                } else {
                    contracts.uniswapV3Factory = await (await factories.MockUniswapV3Factory.deploy()).deployed();
                    await verifyContract(contracts.uniswapV3Factory.address, []);
                    uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
                }

                contracts.invariantChecker = await (await factories.InvariantChecker.deploy()).deployed();
                await verifyContract(contracts.invariantChecker.address, []);
                
                contracts.flashLoanNativeTest = await (await factories.FlashLoanNativeTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanNativeTest.address, []);
                
                contracts.flashLoanAdaptorTest = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanAdaptorTest.address, []);

                contracts.flashLoanAdaptorTest2 = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                await verifyContract(contracts.flashLoanAdaptorTest2.address, []);

                contracts.simpleUniswapPeriphery = await (await factories.SimpleUniswapPeriphery.deploy()).deployed();
                await verifyContract(contracts.simpleUniswapPeriphery.address, []);

                // Setup uniswap pairs
                console.log("Setting up Uniswap Pools....");
                for (let pair of config.testing.uniswapPools) {
                    await (await contracts.uniswapV3Factory.createPool(contracts.tokens[pair[0]].address, contracts.tokens[pair[1]].address, defaultUniswapFee)).wait();
                    const addr = await contracts.uniswapV3Factory.getPool(contracts.tokens[pair[0]].address, contracts.tokens[pair[1]].address, defaultUniswapFee);

                    contracts.uniswapPools[`${pair[0]}/${pair[1]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);
                    contracts.uniswapPools[`${pair[1]}/${pair[0]}`] = await ethers.getContractAt('MockUniswapV3Pool', addr);

                    let inverted = ethers.BigNumber.from(contracts.tokens[pair[0]].address).gt(contracts.tokens[pair[1]].address);
                    uniswapPoolsInverted[`${pair[0]}/${pair[1]}`] = !inverted;
                    uniswapPoolsInverted[`${pair[1]}/${pair[0]}`] = inverted;
                }

                // Initialize uniswap pools for tokens we will activate
                console.log("Initializing uniswap pools for tokens to activate...");
                if (config.testing.useRealUniswap) {
                    for (let token of config.testing.activated) {
                        if (token === 'WETH') continue;
                        let tokenConfig = config.testing.tokens.find(t => t.symbol === token);
                        let pool = `${token}/WETH`;
                        let a = 10 ** (18 - tokenConfig.decimals);
                        let b = 1;
                        let poolSqrtPriceX96 = uniswapPoolsInverted[pool] ? ratioToSqrtPriceX96(a, b) : ratioToSqrtPriceX96(b, a);
                        await (await contracts.uniswapPools[pool].initialize(
                            poolSqrtPriceX96
                        )).wait();
                    }
                }
            }


            if (config.existingContracts) {
                if (config.existingContracts.swapRouter) swapRouterAddress = config.existingContracts.swapRouter;
                if (config.existingContracts.oneInch) oneInchAddress = config.existingContracts.oneInch;
                if (config.existingContracts.eulToken) eul = config.existingContracts.eulToken;
            }

            // Euler Contracts

            contracts.eulerGeneralView = await (await factories.EulerGeneralView.deploy(gitCommit)).deployed();
            await verifyContract(contracts.eulerGeneralView.address, [gitCommit]); 
            console.log(`Deployed EulerGeneralView at: ${contracts.eulerGeneralView.address}`);

            // Deploy module implementations

            let riskManagerSettings;

            if (config.riskManagerSettings && !config.testing) {
                riskManagerSettings = config.riskManagerSettings;
            } else {
                riskManagerSettings = {
                    referenceAsset: contracts.tokens['WETH'].address,
                    uniswapFactory: contracts.uniswapV3Factory.address,
                    uniswapPoolInitCodeHash: uniswapV3PoolByteCodeHash,
                };
            }

            contracts.modules.installer = await (await factories.Installer.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.installer.address, [gitCommit]);
            console.log(`Deployed Installer module at: ${contracts.modules.installer.address}`);

            contracts.modules.markets = await (await factories.Markets.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.markets.address, [gitCommit]);
            console.log(`Deployed Markets module at: ${contracts.modules.markets.address}`);

            contracts.modules.liquidation = await (await factories.Liquidation.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.liquidation.address, [gitCommit]);
            console.log(`Deployed Liquidation module at: ${contracts.modules.liquidation.address}`);

            contracts.modules.governance = await (await factories.Governance.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.governance.address, [gitCommit]);
            console.log(`Deployed Governance module at: ${contracts.modules.governance.address}`);

            contracts.modules.exec = await (await factories.Exec.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.exec.address, [gitCommit]);
            console.log(`Deployed Exec module at: ${contracts.modules.exec.address}`);

            contracts.modules.swap = await (await factories.Swap.deploy(gitCommit, swapRouterAddress, oneInchAddress)).deployed();
            await verifyContract(contracts.modules.swap.address, [gitCommit, swapRouterAddress, oneInchAddress]);
            console.log(`Deployed Swap module at: ${contracts.modules.swap.address}`);

            contracts.modules.eToken = await (await factories.EToken.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.eToken.address, [gitCommit]);
            console.log(`Deployed EToken module at: ${contracts.modules.eToken.address}`);

            contracts.modules.dToken = await (await factories.DToken.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.dToken.address, [gitCommit]);
            console.log(`Deployed DToken module at: ${contracts.modules.dToken.address}`);

            contracts.modules.riskManager = await (await factories.RiskManager.deploy(gitCommit, riskManagerSettings)).deployed();
            await verifyContract(contracts.modules.riskManager.address, [gitCommit, riskManagerSettings]);
            console.log(`Deployed RiskManager module at: ${contracts.modules.riskManager.address}`);

            contracts.modules.irmDefault = await (await factories.IRMDefault.deploy(gitCommit)).deployed();
            await verifyContract(contracts.modules.irmDefault.address, [gitCommit]);
            console.log(`Deployed IRMDefault module at: ${contracts.modules.irmDefault.address}`);


            // Create euler contract, which also installs the installer module and creates a proxy

            contracts.euler = await (await factories.Euler.deploy(deployer.address, contracts.modules.installer.address)).deployed();
            await verifyContract(contracts.euler.address, [deployer.address, contracts.modules.installer.address]);
            console.log(`Deployed Euler at: ${contracts.euler.address}`);

            contracts.eulerSimpleLens = await (await factories.EulerSimpleLens.deploy(gitCommit, contracts.euler.address)).deployed();
            await verifyContract(contracts.eulerSimpleLens.address, [gitCommit, contracts.euler.address]);
            console.log(`Deployed EulerSimpleLens at: ${contracts.eulerSimpleLens.address}`);

            // Get reference to installer proxy
            contracts.installer = await ethers.getContractAt('Installer', await contracts.euler.moduleIdToProxy(moduleIds.INSTALLER));
            await verifyContract(contracts.installer.address, []); // verify proxy once
            console.log(`Deployed Installer Proxy at: ${contracts.installer.address}`);

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

                if (config.testing) modulesToInstall.push(
                    'irmZero',
                    'irmFixed',
                    'irmLinear',
                );

                let moduleAddrs = modulesToInstall.map(m => contracts.modules[m].address);

                await (await contracts.installer.connect(deployer).installModules(moduleAddrs)).wait();

            }

            // Get references to external single proxies

            contracts.markets = await ethers.getContractAt('Markets', await contracts.euler.moduleIdToProxy(moduleIds.MARKETS));
            console.log(`Deployed Markets Proxy at: ${contracts.markets.address}`);

            contracts.liquidation = await ethers.getContractAt('Liquidation', await contracts.euler.moduleIdToProxy(moduleIds.LIQUIDATION));
            console.log(`Deployed Liquidation Proxy at: ${contracts.liquidation.address}`);

            contracts.governance = await ethers.getContractAt('Governance', await contracts.euler.moduleIdToProxy(moduleIds.GOVERNANCE));
            console.log(`Deployed Governance Proxy at: ${contracts.governance.address}`);

            contracts.exec = await ethers.getContractAt('Exec', await contracts.euler.moduleIdToProxy(moduleIds.EXEC));
            console.log(`Deployed Exec Proxy at: ${contracts.exec.address}`);

            contracts.swap = await ethers.getContractAt('Swap', await contracts.euler.moduleIdToProxy(moduleIds.SWAP));
            console.log(`Deployed Swap Proxy at: ${contracts.swap.address}`);


            // Activate test markets, setup pricing params, Setup default ETokens/DTokens
            if (config.testing && testnets.includes(networkName)) {
                // Setup default ETokens/DTokens
                for (let token of (config.testing.tokens || [])) {
                    const tokenContract = contracts.tokens[token.symbol];
                    await (await contracts.markets.connect(deployer).activateMarket(tokenContract.address)).wait();
                    contracts.eTokens[token.symbol] = await contracts.markets.underlyingToEToken(tokenContract.address);
                    contracts.dTokens[token.symbol] = await contracts.markets.underlyingToDToken(tokenContract.address);
                }

                for (let token of (config.testing.tokens || [])) {
                    if (token.config) {
                        // Setup asset configuration
                        if (!config.testing.activated.find(s => s === token.symbol)) throw Error(`cannot set configuration for unactivated asset: ${token.symbol}`);
                        let assetConfig = await contracts.markets.underlyingToAssetConfigUnresolved(contracts.tokens[token.symbol].address);
                        let newConfig = token.config;
                        assetConfig = {
                            eTokenAddress: assetConfig.eTokenAddress,
                            borrowIsolated: assetConfig.borrowIsolated,
                            collateralFactor: assetConfig.collateralFactor,
                            borrowFactor: assetConfig.borrowFactor,
                            twapWindow: assetConfig.twapWindow,
                        };
                        if (newConfig.collateralFactor !== undefined) assetConfig.collateralFactor = Math.floor(newConfig.collateralFactor * 4000000000);
                        if (newConfig.borrowFactor !== undefined) assetConfig.borrowFactor = Math.floor(newConfig.borrowFactor * 4000000000);
                        if (newConfig.borrowIsolated !== undefined) assetConfig.borrowIsolated = newConfig.borrowIsolated;
                        if (newConfig.twapWindow !== undefined) assetConfig.twapWindow = newConfig.twapWindow;
                        if (newConfig.borrowFactor === 'default') newConfig.borrowFactor = 4294967295;
                        if (newConfig.twapWindow === 'default') newConfig.twapWindow = 16777215;

                        await (await contracts.governance.connect(deployer).setAssetConfig(contracts.tokens[token.symbol].address, assetConfig)).wait();

                        if (token.config.pricingType === PRICINGTYPE__CHAINLINK && token.config.price) {
                            // Setup chainlink price feed address
                            await (await contracts.governance.connect(deployer).setChainlinkPriceFeed(contracts.tokens[token.symbol].address, contracts.chainlinkOracles[token.symbol].address)).wait();
                            // Setup pricing configuration
                            await (await contracts.governance.connect(deployer).setPricingConfig(contracts.tokens[token.symbol].address, PRICINGTYPE__CHAINLINK, defaultUniswapFee)).wait();
                            // Setup chainlink prices
                            await (await contracts.chainlinkOracles[token.symbol].mockSetValidAnswer(ethers.utils.parseEther(`${token.config.price}`))).wait();
                        }
                    }
                }
            }

            // Setup adaptors
            contracts.flashLoan = await (await factories.FlashLoan.deploy(
                contracts.euler.address,
                contracts.exec.address,
                contracts.markets.address,
            )).deployed();
            await verifyContract(contracts.flashLoan.address, [
                contracts.euler.address,
                contracts.exec.address,
                contracts.markets.address,
            ]);
            console.log(`Deployed FlashLoan at: ${contracts.flashLoan.address}`);

            // Setup liquidity mining contracts

            if (eul !== ethers.utils.AddressZero) {
                contracts.eulStakes = await (await factories.EulStakes.deploy(
                    eul,
                )).deployed();
                await verifyContract(contracts.eulStakes.address, [eul]);
                console.log(`Deployed EulStakes at: ${contracts.eulStakes.address}`);

                contracts.eulDistributor = await (await factories.EulDistributor.deploy(
                    eul,
                    contracts.eulStakes.address,
                )).deployed();
                await verifyContract(contracts.eulDistributor.address, [eul, contracts.eulStakes.address]);
                console.log(`Deployed EulDistributor at: ${contracts.eulDistributor.address}`);

                contractAddresses = exportAddressManifest(contracts);
                // write addresses to manifest file
                writeAddressManifestToFile(contractAddresses, `addresses/euler-addresses-${networkName}.json`);
            }

        } catch (e) {
            console.log(e.message)
        }

    });

function exportAddressManifest(contracts) {
    let output = {
        tokens: {},
        eTokens: {},
        dTokens: {},
        uniswapPools: {},
        chainlinkOracles: {},
        modules: {},
    };

    for (let name of Object.keys(contracts)) {
        if (contracts[name].address) output[name] = contracts[name].address;
    }

    for (let token of Object.keys(contracts.tokens)) {
        output.tokens[token] = contracts.tokens[token].address;
    }

    for (let moduleName of Object.keys(contracts.modules)) {
        output.modules[moduleName] = contracts.modules[moduleName].address;
    }

    for (let token of Object.keys(contracts.tokens)) {
        if (contracts.chainlinkOracles[token]) {
            output.chainlinkOracles[token] = contracts.chainlinkOracles[token].address;
        }
    }

    for (let token of Object.keys(contracts.tokens)) {
        if (contracts.eTokens[token]) {
            output.eTokens[token] = contracts.eTokens[token];
        }
    }

    for (let token of Object.keys(contracts.tokens)) {
        if (contracts.dTokens[token]) {
            output.dTokens[token] = contracts.dTokens[token];
        }
    }

    for (let token of Object.keys(contracts.tokens)) {
        if (contracts.uniswapPools[`${token}/WETH`]) {
            output.uniswapPools[token] = contracts.uniswapPools[`${token}/WETH`].address;
        }
    }

    return output;
}

function writeAddressManifestToFile(addressManifest, filename) {
    let outputJson = JSON.stringify(addressManifest, ' ', 4);
    fs.writeFileSync(filename, outputJson + "\n");
}

async function verifyContract(contractAddress, contractArgs) {
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [...contractArgs],
        });
    } catch (error) {
        console.log(`ETHERSCAN ERROR: verification for contract at ${contractAddress}, failed\n ${error.message}`);
    }
}