const hre = require("hardhat");
const { utils, Wallet } = require("zksync-web3");
const ethers = require("ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { moduleIds, contractNames, AddressZero } = require("../test/lib/eTestLib");

async function main() {
    let verification = {
        contracts: {
            tokens: {},
            modules: {},
            swapHandlers: {}
        },
    };

    // Initialize the wallet.
    const wallet = new Wallet(process.env.PRIVATE_KEY);

    // Create deployer object and load the 
    // artifact of the contract we want to deploy.
    const deployer = new Deployer(hre, wallet);

    let ctx = await buildContext();

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
            const contract = await deployer.deploy(artifact, constructorArguments);
            ctx.contracts.tokens[token.symbol] = contract;
            verification.contracts.tokens[token.symbol] = contract.interface.encodeDeploy(constructorArguments);
        }

        // Libraries and testing

        if (ctx.tokenSetup.testing.useRealUniswap) {
            // todo
        } else {
            const artifact = await deployer.loadArtifact("MockUniswapV3Factory");
            const constructorArguments = [];
            const contract = await deployer.deploy(artifact, constructorArguments);
            ctx.contracts.uniswapV3Factory = contract;
            verification.contracts.uniswapV3Factory = contract.interface.encodeDeploy(constructorArguments);
            ctx.uniswapV3PoolByteCodeHash = ethers.utils.keccak256((await ethers.getContractFactory('MockUniswapV3Pool')).bytecode);
        }

        let artifact = await deployer.loadArtifact("InvariantChecker");
        let constructorArguments = [];
        let contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.invariantChecker = contract;
        verification.contracts.invariantChecker = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanNativeTest");
        constructorArguments = [];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.flashLoanNativeTest = contract;
        verification.contracts.flashLoanNativeTest = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanAdaptorTest");
        constructorArguments = [];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.flashLoanAdaptorTest = contract;
        verification.contracts.flashLoanAdaptorTest = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("FlashLoanAdaptorTest");
        constructorArguments = [];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.flashLoanAdaptorTest2 = contract;
        verification.contracts.flashLoanAdaptorTest2 = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("SimpleUniswapPeriphery");
        constructorArguments = [];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.simpleUniswapPeriphery = contract;
        verification.contracts.simpleUniswapPeriphery = contract.interface.encodeDeploy(constructorArguments);

        // Setup uniswap pairs

        for (let pair of ctx.tokenSetup.testing.uniswapPools) {
            // todo
            // https://v2-docs.zksync.io/dev/developer-guides/hello-world.html#front-end-integration
            // await ctx.createUniswapPool(pair, defaultUniswapFee);
        }

        // Initialize uniswap pools for tokens we will activate
        // https://v2-docs.zksync.io/dev/developer-guides/hello-world.html#front-end-integration
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

    let artifact = await deployer.loadArtifact("Installer");
    let constructorArguments = [gitCommit];
    let contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.installer = contract;
    verification.contracts.modules.installer = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Markets");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.markets = contract;
    verification.contracts.modules.markets = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Liquidation");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.liquidation = contract;
    verification.contracts.modules.liquidation = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Governance");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.governance = contract;
    verification.contracts.modules.governance = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Exec");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.exec = contract;
    verification.contracts.modules.exec = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("Swap");
    constructorArguments = [gitCommit, swapRouterV3Address, oneInchAddress];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.swap = contract;
    verification.contracts.modules.swap = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHub");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.swapHub = contract;
    verification.contracts.modules.swapHub = contract.interface.encodeDeploy(constructorArguments);


    artifact = await deployer.loadArtifact("EToken");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.eToken = contract;
    verification.contracts.modules.eToken = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("DToken");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.dToken = contract;
    verification.contracts.modules.dToken = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("RiskManager");
    constructorArguments = [gitCommit, riskManagerSettings];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.riskManager = contract;
    verification.contracts.modules.riskManager = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("IRMDefault");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.modules.irmDefault = contract;
    verification.contracts.modules.irmDefault = contract.interface.encodeDeploy(constructorArguments);

    if (ctx.tokenSetup.testing) {
        let artifact = await deployer.loadArtifact("IRMZero");
        let constructorArguments = [gitCommit];
        let contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.modules.irmZero = contract;
        verification.contracts.modules.irmZero = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("IRMFixed");
        constructorArguments = [gitCommit];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.modules.irmFixed = contract;
        verification.contracts.modules.irmFixed = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("IRMLinear");
        constructorArguments = [gitCommit];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.modules.irmLinear = contract;
        verification.contracts.modules.irmLinear = contract.interface.encodeDeploy(constructorArguments);
    }

    // Create euler contract, which also installs the installer module and creates a proxy

    artifact = await deployer.loadArtifact("Euler");
    constructorArguments = [wallet.address, ctx.contracts.modules.installer.address];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.euler = contract;
    verification.contracts.euler = contract.interface.encodeDeploy(constructorArguments);

    // Create euler view contracts

    artifact = await deployer.loadArtifact("EulerSimpleLens");
    constructorArguments = [gitCommit, ctx.contracts.euler.address];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.eulerSimpleLens = contract;
    verification.contracts.eulerSimpleLens = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("EulerGeneralView");
    constructorArguments = [gitCommit];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.eulerGeneralView = contract;
    verification.contracts.eulerGeneralView = contract.interface.encodeDeploy(constructorArguments);

    // Get reference to installer proxy

    // todo

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

        // todo install modules

    }

    // todo
    // Get references to external single proxies

    // Deploy swap handlers
    artifact = await deployer.loadArtifact("SwapHandlerUniswapV3");
    constructorArguments = [swapRouterV3Address];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.swapHandlers.swapHandlerUniswapV3 = contract;
    verification.contracts.swapHandlers.swapHandlerUniswapV3 = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHandler1Inch");
    constructorArguments = [oneInchAddress, swapRouterV2Address, swapRouterV3Address];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.swapHandlers.swapHandler1Inch = contract;
    verification.contracts.swapHandlers.swapHandler1Inch = contract.interface.encodeDeploy(constructorArguments);

    artifact = await deployer.loadArtifact("SwapHandlerUniAutoRouter");
    constructorArguments = [swapRouter02Address, swapRouterV2Address, swapRouterV3Address];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.swapHandlers.swapHandlerUniAutoRouter = contract;
    verification.contracts.swapHandlers.swapHandlerUniAutoRouter = contract.interface.encodeDeploy(constructorArguments);

    if (ctx.tokenSetup.testing) {
        // todo
        // Setup default ETokens/DTokens

    }

    // Setup adaptors

    artifact = await deployer.loadArtifact("FlashLoan");
    constructorArguments = [
        ctx.contracts.euler.address,
        ctx.contracts.exec.address,
        ctx.contracts.markets.address,
    ];
    contract = await deployer.deploy(artifact, constructorArguments);
    ctx.contracts.flashLoan = contract;
    verification.contracts.flashLoan = contract.interface.encodeDeploy(constructorArguments);

    // Setup liquidity mining contracts

    if (ctx.contracts.tokens.EUL) {
        let artifact = await deployer.loadArtifact("EulStakes");
        let constructorArguments = [
            ctx.contracts.tokens.EUL.address
        ];
        let contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.eulStakes = contract;
        verification.contracts.eulStakes = contract.interface.encodeDeploy(constructorArguments);

        artifact = await deployer.loadArtifact("EulDistributor");
        constructorArguments = [
            ctx.contracts.tokens.EUL.address,
            ctx.contracts.eulStakes.address,
        ];
        contract = await deployer.deploy(artifact, constructorArguments);
        ctx.contracts.eulDistributor = contract;
        verification.contracts.eulDistributor = contract.interface.encodeDeploy(constructorArguments);

    }

    // export verification json file for zkSync smart contract verification UI
    let outputJson = JSON.stringify(verification, ' ', 4);
    fs.writeFileSync(`./euler-contracts-verification-${tokenSetupName}.json`, outputJson + "\n");

    return ctx;

}



async function buildContext() {
    let ctx = {
        moduleIds,

        contracts: {
            tokens: {},
            eTokens: {},
            dTokens: {},
            uniswapPools: {},
            modules: {},
            swapHandlers: {}
        },

        uniswapPoolsInverted: {},
    };

    // Token Setup
    ctx.tokenSetup = require(`./token-setups/${tokenSetupName}`);

    return ctx;
}


main();