const fs = require('fs');
const child_process = require("child_process");
const { ratioToSqrtPriceX96, sqrtPriceX96ToPrice, } = require(`${__dirname}../../test/lib/sqrtPriceUtils.js`);

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

        if (!process.env.ETHERSCAN_API_KEY) {
            throw Error("Required process.env.ETHERSCAN_API_KEY variable not found.");
        }

        const defaultUniswapFee = 3000;
        // const PRICINGTYPE__UNISWAP3_TWAP = 2;
        const PRICINGTYPE__CHAINLINK = 4;

        // Configuration
        const config = require(`${__dirname}../../test/lib/token-setups/${networkName}`);

        const outputFilePath = `${__dirname}../../addresses/euler-addresses-${networkName}.json`;

        let currentState;
        try {
            currentState = require(outputFilePath);
        } catch (err) {
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

        let verification = [];

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

        if (config.contracts && config.contracts.length > 0) {
            console.log(`Deploying the following contracts to ${networkName}`, config.contracts);

            console.log(`Deploying to ${networkName} with Git Commit ${gitCommit} via Signer ${deployer.address}......\n`);


            if (config.contracts.includes('Swap')) {
                if (!config.existingContracts.swapRouterAddress || !config.existingContracts.oneInchAddress) {
                    throw Error("please specify existingContracts.swapRouterAddress and existingContracts.oneInchAddress for Swap deployment");
                }
            }

            if (config.contracts.includes('RiskManager')) {
                if (!config.riskManagerSettings) {
                    throw Error("please specify riskManagerSettings for RiskManager deployment");
                }
            }

            console.log('Initialising smart contract factories......\n');
            for (let c of config.contracts) {
                factories[c] = await ethers.getContractFactory(c);
            }



            factories.MockAggregatorProxy = await ethers.getContractFactory('MockAggregatorProxy');

            let swapRouterAddress = ethers.constants.AddressZero;
            let oneInchAddress = ethers.constants.AddressZero;

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
                    verification.push({
                        address: contracts[contract].address, args: [gitCommit]
                    });
                    output[`${contract.charAt(0).toLowerCase() + contract.slice(1)}`] = contracts[contract].address;
                } catch (e) {
                    console.log(`Could not deploy ${contract} with single gitCommit parameter`)
                }
            }

            if (config.contracts.includes('Swap')) {
                contracts.swap = await (await factories.Swap.deploy(gitCommit, swapRouterAddress, oneInchAddress)).deployed();
                output.swap = contracts.swap.address;
                verification.push({
                    address: contracts.swap.address, args: [gitCommit, swapRouterAddress, oneInchAddress]
                });
                console.log(`Deployed Swap module at: ${contracts.swap.address}`);
            }

            if (config.contracts.includes('RiskManager')) {
                if (config.riskManagerSettings) {
                    let riskManagerSettings = config.riskManagerSettings;
                    contracts.riskManager = await (await factories.RiskManager.deploy(gitCommit, riskManagerSettings)).deployed();
                    output.riskManager = contracts.risikManager.address;
                    verification.push({
                        address: contracts.riskManager.address, args: [gitCommit, riskManagerSettings]
                    });
                    console.log(`Deployed RiskManager module at: ${contracts.riskManager.address}`);
                }
            }

            if (config.contracts.includes('EulerSimpleLens')) {
                contracts.eulerSimpleLens = await (await factories.EulerSimpleLens.deploy(gitCommit, contracts.euler.address)).deployed();
                output.eulerSimpleLens = contracts.eulerSimpleLens.address;
                verification.push({
                    address: contracts.eulerSimpleLens.address, args: [gitCommit, contracts.euler.address]
                });
                console.log(`Deployed EulerSimpleLens at: ${contracts.eulerSimpleLens.address}`);
            }

            // Setup adaptors
            if (config.contracts.includes('FlashLoan')) {
                contracts.flashLoan = await (await factories.FlashLoan.deploy(
                    contracts.euler.address,
                    contracts.exec.address,
                    contracts.markets.address,
                )).deployed();
                output.flashLoan = contracts.flashLoan.address;
                verification.push({
                    address: contracts.flashLoan.address, args: [contracts.euler.address, contracts.exec.address, contracts.markets.address]
                });
                console.log(`Deployed FlashLoan at: ${contracts.flashLoan.address}`);
            }

            // Get reference to installer proxy
            // Assuming deployer is installer admin on testnet
            if (testnets.includes(networkName)) {

                contracts.installer = await ethers.getContractAt('Installer', await contracts.euler.moduleIdToProxy(moduleIds.INSTALLER));
                console.log(`Found Installer Proxy at: ${contracts.installer.address}`);

                // Install modules
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
                            if (contract.startsWith('IRM')) {
                                output.modules[module] = (await ethers.getContractAt(contract, await contracts.euler.moduleIdToProxy(moduleIds['IRM_' + contract.slice(3).toUpperCase()]))).address;
                            } else {
                                output.modules[module] = (await ethers.getContractAt(contract, await contracts.euler.moduleIdToProxy(moduleIds[contract.toUpperCase()]))).address;
                            }
                        }
                    }
                }
            }

        } else {
            console.log("No smart contracts specified for redeployment or updates");
        }

        if (config.testing && testnets.includes(networkName)) {
            if (currentState.InvariantChecker === undefined) {
                factories.InvariantChecker = await ethers.getContractFactory('InvariantChecker');
                contracts.invariantChecker = await (await factories.InvariantChecker.deploy()).deployed();
                verification.push({
                    address: contracts.invariantChecker.address, args: []
                });
                output.invariantChecker = contracts.invariantChecker.address;
            }

            if (currentState.FlashLoanNativeTest === undefined) {
                factories.FlashLoanNativeTest = await ethers.getContractFactory('FlashLoanNativeTest');
                contracts.flashLoanNativeTest = await (await factories.FlashLoanNativeTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanNativeTest.address, args: []
                });
                output.flashLoanNativeTest = contracts.flashLoanNativeTest.address;
            }

            if (currentState.FlashLoanAdaptorTest === undefined) {
                factories.FlashLoanAdaptorTest = await ethers.getContractFactory('FlashLoanAdaptorTest');
                contracts.flashLoanAdaptorTest = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanAdaptorTest.address, args: []
                });
                output.flashLoanAdaptorTest = contracts.flashLoanAdaptorTest.address;
            }

            if (currentState.FlashLoanAdaptorTest2 === undefined) {
                factories.FlashLoanAdaptorTest = await ethers.getContractFactory('FlashLoanAdaptorTest');
                contracts.flashLoanAdaptorTest2 = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanAdaptorTest2.address, args: []
                });
                output.flashLoanAdaptorTest2 = contracts.flashLoanAdaptorTest2.address;
            }

            if (currentState.SimpleUniswapPeriphery === undefined) {
                factories.SimpleUniswapPeriphery = await ethers.getContractFactory('SimpleUniswapPeriphery');
                contracts.simpleUniswapPeriphery = await (await factories.SimpleUniswapPeriphery.deploy()).deployed();
                verification.push({
                    address: contracts.simpleUniswapPeriphery.address, args: []
                });
                output.simpleUniswapPeriphery = contracts.simpleUniswapPeriphery.address;
            }

            // Update test asset configurations, e.g., pricing params
            for (let token of (config.testing.tokens || [])) {
                contracts.markets = await ethers.getContractAt('Markets', currentState.modules.markets);

                if (token.config) {
                    // Deploy test chainlink price oracles with ETH
                    // if current deployment pricing type is not chainlink
                    if (token.config.pricingType === PRICINGTYPE__CHAINLINK && currentState.uniswapPools[token.symbol]) {
                        contracts.chainlinkOracles[token.symbol] = await (await factories.MockAggregatorProxy.deploy(18)).deployed();
                        output.chainlinkOracles[token.symbol] = contracts.chainlinkOracles[token.symbol].address;
                        verification.push({
                            address: contracts.chainlinkOracles[token.symbol].address, args: [18]
                        });
                        console.log(`Deployed ERC20 Token ${token.symbol} Chainlink Price Oracle at: ${contracts.chainlinkOracles[token.symbol].address}`);
                    }

                    // Update asset configuration
                    if (!config.testing.activated.find(s => s === token.symbol)) {
                        console.log(`Cannot set config for unactivated asset: ${token.symbol}`);
                        continue;
                    }

                    if (currentState.tokens[token.symbol] !== undefined) {
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

        console.log(output);

        await verifyBatch(verification);

    });


task("deploy", "Full deploy of Euler smart contracts and specified test markets")
    .setAction(async () => {
        try {
            if (!process.env.ETHERSCAN_API_KEY) {
                throw Error("Required process.env.ETHERSCAN_API_KEY variable not found.");
            }

            const networkName = network.name;

            const defaultUniswapFee = 3000;
            // const PRICINGTYPE__UNISWAP3_TWAP = 2;
            const PRICINGTYPE__CHAINLINK = 4;

            // Configuration
            const config = require(`${__dirname}../../test/lib/token-setups/${networkName}`);

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

            let verification = [];

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
                verification.push(
                    { address: contracts.modules.irmZero.address, args: [gitCommit] }
                );
                console.log(`Deployed IRMZero module at: ${contracts.modules.irmZero.address}`);

                contracts.modules.irmFixed = await (await factories.IRMFixed.deploy(gitCommit)).deployed();
                verification.push(
                    { address: contracts.modules.irmFixed.address, args: [gitCommit] }
                );
                console.log(`Deployed IRMFixed module at: ${contracts.modules.irmFixed.address}`);

                contracts.modules.irmLinear = await (await factories.IRMLinear.deploy(gitCommit)).deployed();
                verification.push(
                    { address: contracts.modules.irmLinear.address, args: [gitCommit] }
                );
                console.log(`Deployed IRMLinear module at: ${contracts.modules.irmLinear.address}`);

                // Deploy test tokens
                for (let token of (config.testing.tokens || [])) {
                    contracts.tokens[token.symbol] = await (await factories.TestERC20.deploy(token.name, token.symbol, token.decimals, false)).deployed();
                    verification.push(
                        { address: contracts.tokens[token.symbol].address, args: [token.name, token.symbol, token.decimals, false] }
                    );
                    console.log(`Deployed ERC20 Token ${token.symbol} at: ${contracts.tokens[token.symbol].address}`);

                    // Deploy test chainlink price oracles with ETH
                    // if pricing type is chainlink
                    if (token.config.pricingType === PRICINGTYPE__CHAINLINK) {
                        contracts.chainlinkOracles[token.symbol] = await (await factories.MockAggregatorProxy.deploy(18)).deployed();
                        verification.push(
                            { address: contracts.chainlinkOracles[token.symbol].address, args: [18] }
                        );
                        console.log(`Deployed ERC20 Token ${token.symbol} Chainlink Price Oracle at: ${contracts.chainlinkOracles[token.symbol].address}`);
                    }

                }

                if (config.testing.useRealUniswap) {
                    console.log("Deploying Uniswap Contracts....");
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/UniswapV3Factory.json");
                        const uniswapV3FactoryFactory = new ethers.ContractFactory(abi, bytecode, deployer);
                        contracts.uniswapV3Factory = await (await uniswapV3FactoryFactory.deploy()).deployed();
                        verification.push(
                            { address: contracts.uniswapV3Factory.address, args: [] }
                        );
                    }
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/SwapRouter.json");
                        const SwapRouterFactory = new ethers.ContractFactory(abi, bytecode, deployer);
                        contracts.swapRouter = await (await SwapRouterFactory.deploy(contracts.uniswapV3Factory.address, contracts.tokens['WETH'].address)).deployed();
                        swapRouterAddress = contracts.swapRouter.address;
                        verification.push(
                            { address: swapRouterAddress, args: [contracts.uniswapV3Factory.address, contracts.tokens['WETH'].address] }
                        );
                    }
                    {
                        const { abi, bytecode, } = require("../test/vendor-artifacts/UniswapV3Pool.json");
                        uniswapV3PoolByteCodeHash = ethers.utils.keccak256(bytecode);
                    }

                } else {
                    contracts.uniswapV3Factory = await (await factories.MockUniswapV3Factory.deploy()).deployed();
                    verification.push(
                        { address: contracts.uniswapV3Factory.address, args: [] }
                    );
                    uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
                }

                contracts.invariantChecker = await (await factories.InvariantChecker.deploy()).deployed();
                verification.push({
                    address: contracts.invariantChecker.address, args: []
                });

                contracts.flashLoanNativeTest = await (await factories.FlashLoanNativeTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanNativeTest.address, args: []
                });

                contracts.flashLoanAdaptorTest = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanAdaptorTest.address, args: []
                });

                contracts.flashLoanAdaptorTest2 = await (await factories.FlashLoanAdaptorTest.deploy()).deployed();
                verification.push({
                    address: contracts.flashLoanAdaptorTest2.address, args: []
                });

                contracts.simpleUniswapPeriphery = await (await factories.SimpleUniswapPeriphery.deploy()).deployed();
                verification.push({
                    address: contracts.simpleUniswapPeriphery.address, args: []
                });

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
            verification.push({
                address: contracts.eulerGeneralView.address, args: [gitCommit]
            });
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
            verification.push({
                address: contracts.modules.installer.address, args: [gitCommit]
            });
            console.log(`Deployed Installer module at: ${contracts.modules.installer.address}`);

            contracts.modules.markets = await (await factories.Markets.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.markets.address, args: [gitCommit]
            });
            console.log(`Deployed Markets module at: ${contracts.modules.markets.address}`);

            contracts.modules.liquidation = await (await factories.Liquidation.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.liquidation.address, args: [gitCommit]
            });
            console.log(`Deployed Liquidation module at: ${contracts.modules.liquidation.address}`);

            contracts.modules.governance = await (await factories.Governance.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.installer.address, args: [gitCommit]
            });
            console.log(`Deployed Governance module at: ${contracts.modules.governance.address}`);

            contracts.modules.exec = await (await factories.Exec.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.exec.address, args: [gitCommit]
            });

            console.log(`Deployed Exec module at: ${contracts.modules.exec.address}`);

            contracts.modules.swap = await (await factories.Swap.deploy(gitCommit, swapRouterAddress, oneInchAddress)).deployed();
            verification.push({
                address: contracts.modules.swap.address, args: [gitCommit, swapRouterAddress, oneInchAddress]
            });

            console.log(`Deployed Swap module at: ${contracts.modules.swap.address}`);

            contracts.modules.eToken = await (await factories.EToken.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.eToken.address, args: [gitCommit]
            });
            console.log(`Deployed EToken module at: ${contracts.modules.eToken.address}`);

            contracts.modules.dToken = await (await factories.DToken.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.dToken.address, args: [gitCommit]
            });
            console.log(`Deployed DToken module at: ${contracts.modules.dToken.address}`);

            contracts.modules.riskManager = await (await factories.RiskManager.deploy(gitCommit, riskManagerSettings)).deployed();
            verification.push({
                address: contracts.modules.riskManager.address, args: [gitCommit, riskManagerSettings]
            });
            console.log(`Deployed RiskManager module at: ${contracts.modules.riskManager.address}`);

            contracts.modules.irmDefault = await (await factories.IRMDefault.deploy(gitCommit)).deployed();
            verification.push({
                address: contracts.modules.irmDefault.address, args: [gitCommit], contractPath: "contracts/modules/interest-rate-models/IRMDefault.sol:IRMDefault"
            });
            console.log(`Deployed IRMDefault module at: ${contracts.modules.irmDefault.address}`);


            // Create euler contract, which also installs the installer module and creates a proxy

            contracts.euler = await (await factories.Euler.deploy(deployer.address, contracts.modules.installer.address)).deployed();
            verification.push({
                address: contracts.euler.address, args: [deployer.address, contracts.modules.installer.address]
            });
            console.log(`Deployed Euler at: ${contracts.euler.address}`);

            contracts.eulerSimpleLens = await (await factories.EulerSimpleLens.deploy(gitCommit, contracts.euler.address)).deployed();
            verification.push({
                address: contracts.eulerSimpleLens.address, args: [gitCommit, contracts.euler.address]
            });
            console.log(`Deployed EulerSimpleLens at: ${contracts.eulerSimpleLens.address}`);

            // Get reference to installer proxy
            contracts.installer = await ethers.getContractAt('Installer', await contracts.euler.moduleIdToProxy(moduleIds.INSTALLER));
            verification.push({
                address: contracts.installer.address, args: []
            });
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
                    if (!config.testing.activated.find(s => s === token.symbol)) {
                        console.log(`Cannot set configuration for unactivated asset: ${token.symbol}`);
                        continue;
                    }
                    const tokenContract = contracts.tokens[token.symbol];
                    await (await contracts.markets.connect(deployer).activateMarket(tokenContract.address)).wait();
                    contracts.eTokens[token.symbol] = await contracts.markets.underlyingToEToken(tokenContract.address);
                    contracts.dTokens[token.symbol] = await contracts.markets.underlyingToDToken(tokenContract.address);
                }

                for (let token of (config.testing.tokens || [])) {
                    if (token.config) {
                        // Setup asset configuration
                        if (!config.testing.activated.find(s => s === token.symbol)) {
                            console.log(`Cannot set configuration for unactivated asset: ${token.symbol}`);
                            continue;
                        }
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
            verification.push({
                address: contracts.flashLoan.address, args: [contracts.euler.address, contracts.exec.address, contracts.markets.address]
            });
            console.log(`Deployed FlashLoan at: ${contracts.flashLoan.address}`);

            // Setup liquidity mining contracts

            if (eul !== ethers.utils.AddressZero) {
                contracts.eulStakes = await (await factories.EulStakes.deploy(
                    eul,
                )).deployed();
                verification.push({
                    address: contracts.eulStakes.address, args: []
                });
                console.log(`Deployed EulStakes at: ${contracts.eulStakes.address}`);

                contracts.eulDistributor = await (await factories.EulDistributor.deploy(
                    eul,
                    contracts.eulStakes.address,
                )).deployed();
                verification.push({
                    address: contracts.eulDistributor.address, args: [eul, contracts.eulStakes.address]
                });
                console.log(`Deployed EulDistributor at: ${contracts.eulDistributor.address}`);

                contractAddresses = exportAddressManifest(contracts);
                // write addresses to manifest file
                writeAddressManifestToFile(contractAddresses, `addresses/euler-addresses-${networkName}.json`);

                await verifyBatch(verification);
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

async function verifyBatch(verification) {
    for (let contract of verification) {
        await verifyContract(contract.address, contract.args, contract.contractPath);
    }
}

async function verifyContract(contractAddress, contractArgs, contractPath = null) {
    try {
        if (contractPath === null || contractPath === undefined) {
            await run("verify:verify", {
                address: contractAddress,
                constructorArguments: [...contractArgs],
            });
        } else {
            await run("verify:verify", {
                address: contractAddress,
                constructorArguments: [...contractArgs],
                contract: contractPath
            });
        }

    } catch (error) {
        console.log(`Etherscan smart contract verification for contract at ${contractAddress}, was not successful\n ${error.message}`);
    }
}