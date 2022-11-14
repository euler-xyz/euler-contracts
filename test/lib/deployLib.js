async function verifyBatch(verification) {
    console.log("Verifying test tokens");
    for (let token of Object.keys(verification.contracts.tokens)) {
        console.log(token, verification.contracts.tokens[token].address, verification.contracts.tokens[token].args, verification.contracts.tokens[token].contractPath);
        await verifyContract(verification.contracts.tokens[token].address, verification.contracts.tokens[token].args, verification.contracts.tokens[token].contractPath);
    }

    console.log("Verifying modules");
    for (let module of Object.keys(verification.contracts.modules)) {
        console.log(module, verification.contracts.modules[module].address, verification.contracts.modules[module].args, verification.contracts.modules[module].contractPath);
        await verifyContract(verification.contracts.modules[module].address, verification.contracts.modules[module].args, verification.contracts.modules[module].contractPath);
    }

    console.log("Verifying swap handlers");
    for (let handler of Object.keys(verification.contracts.swapHandlers)) {
        console.log(handler, verification.contracts.swapHandlers[handler].address, verification.contracts.swapHandlers[handler].args, verification.contracts.swapHandlers[handler].contractPath);
        await verifyContract(verification.contracts.swapHandlers[handler].address, verification.contracts.swapHandlers[handler].args, verification.contracts.swapHandlers[handler].contractPath);
    }

    console.log("Verifying euler contracts");
    for (let contract of Object.keys(verification.contracts)) {
        if (
            (verification.contracts[contract].address !== null && verification.contracts[contract].address !== undefined) 
            && 
            (verification.contracts[contract].args !== null && verification.contracts[contract].args !== undefined)
        ) {
            console.log(contract, verification.contracts[contract].address, verification.contracts[contract].args, verification.contracts[contract].contractPath);
            await verifyContract(verification.contracts[contract].address, verification.contracts[contract].args, verification.contracts[contract].contractPath);
        }
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
        console.log(`Smart contract verification for contract at ${contractAddress}, was not successful\n ${error.message}`);
    }
}

module.exports = {
    verifyBatch,
    verifyContract
}
