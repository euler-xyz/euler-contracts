async function verifyContract(contractAddress, contractArgs, contractPath = null) {
    try {
        if (contractPath) {
            await run("verify:verify", {
                address: contractAddress,
                constructorArguments: [...contractArgs],
                contract: contractPath
            });
        } else {
            await run("verify:verify", {
                address: contractAddress,
                constructorArguments: [...contractArgs],
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
