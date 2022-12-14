const hre = require("hardhat");
const { utils, Wallet } = require("zksync-web3");
const ethers = require("ethers");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const { moduleIds, contractNames } = require("../test/lib/eTestLib");

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
    let swapRouterV2Address = module.exports.AddressZero;
    let swapRouterV3Address = module.exports.AddressZero;
    let swapRouter02Address = module.exports.AddressZero;
    let oneInchAddress = module.exports.AddressZero;

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

        
    }
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

async function verifyBatch(verification) {
    
    if (Object.keys(verification.contracts.tokens).length > 0) {
        console.log("Verifying test tokens");
        for (let token of Object.keys(verification.contracts.tokens)) {
            console.log(token, verification.contracts.tokens[token].address, verification.contracts.tokens[token].args, verification.contracts.tokens[token].contractPath);
            await verifyContract(verification.contracts.tokens[token].address, verification.contracts.tokens[token].args, verification.contracts.tokens[token].contractPath);
        }
    }
    
    if (Object.keys(verification.contracts.modules).length > 0) {
        console.log("Verifying modules");
        for (let module of Object.keys(verification.contracts.modules)) {
            console.log(module, verification.contracts.modules[module].address, verification.contracts.modules[module].args, verification.contracts.modules[module].contractPath);
            await verifyContract(verification.contracts.modules[module].address, verification.contracts.modules[module].args, verification.contracts.modules[module].contractPath);
        }
    }
    
    if (Object.keys(verification.contracts.swapHandlers).length > 0) {
        console.log("Verifying swap handlers");
        for (let handler of Object.keys(verification.contracts.swapHandlers)) {
            console.log(handler, verification.contracts.swapHandlers[handler].address, verification.contracts.swapHandlers[handler].args, verification.contracts.swapHandlers[handler].contractPath);
            await verifyContract(verification.contracts.swapHandlers[handler].address, verification.contracts.swapHandlers[handler].args, verification.contracts.swapHandlers[handler].contractPath);
        }
    }
    
    if (Object.keys(verification.contracts).length > 0) {
        console.log("Verifying euler contracts");
        for (let contract of Object.keys(verification.contracts)) {
            if (verification.contracts[contract].address && verification.contracts[contract].args) {
                console.log(contract, verification.contracts[contract].address, verification.contracts[contract].args, verification.contracts[contract].contractPath);
                await verifyContract(verification.contracts[contract].address, verification.contracts[contract].args, verification.contracts[contract].contractPath);
            }
        }
    }
    
}


main();