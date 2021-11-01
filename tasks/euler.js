task("euler", "Interact with Euler contract")
    .addPositionalParam("designator", "contract.function")
    .addOptionalVariadicPositionalParam("args")
    .addFlag("callstatic")
    .addFlag("estimategas")
    .addOptionalParam("impersonate")
    .setAction(async ({ designator, args, callstatic, estimategas, impersonate, }) => {
        const et = require("../test/lib/eTestLib");
        const ctx = await et.getTaskCtx();

        let components = designator.split('.');
        let contract = ctx.contracts;
        while (components.length > 1) contract = contract[components.shift()];
        let functionName = components[0];

        let fragment = contract.interface.fragments.find(f => f.name === functionName);
        if (!fragment) throw(`no such function found: ${functionName}`);

        args = (args || []).map(a => {
            if (a === 'me') return ctx.wallet.address;
            if (a === 'euler') return ctx.contracts.euler.address;
            if (a === 'ref') return ctx.tokenSetup.riskManagerSettings.referenceAsset;
            if (a === 'max') return et.MaxUint256;
            if (a.startsWith('token:')) return ctx.contracts.tokens[a.split(':')[1]].address;
            if (a.startsWith('0x')) return a;
            if (!isNaN(parseFloat(a))) return ethers.BigNumber.from(parseFloat(a) + '');
            return a;
        });

        let res;

        try {
            if (fragment.constant) {
                res = await contract[functionName].apply(null, args);
            } else if (estimategas) {
                res = await contract.estimateGas[functionName].apply(null, args);
            } else if (callstatic) {
                res = await contract.callStatic[functionName].apply(null, args);
            } else {
                let signer = ctx.wallet;

                if (impersonate) {
                    await network.provider.request({
                        method: "hardhat_impersonateAccount",
                        params: [impersonate],
                    });
                    signer = await ethers.getSigner(impersonate)
                }
                let estimateGasResult = await contract.connect(signer).estimateGas[functionName].apply(null, args);

                args.push({ gasLimit: Math.floor(estimateGasResult * 1.01 + 1000), });
                let tx = await contract.connect(signer).functions[functionName].apply(null, args);
                console.log(`tx: ${tx.hash}`);
                res = await tx.wait();

                if (impersonate) {
                    await network.provider.request({
                        method: "hardhat_stopImpersonatingAccount",
                        params: [impersonate],
                    });
                }
            }
        } catch (e) {
            console.error("ERROR");
            console.error(e);
            process.exit(1);
        }

        console.log(et.dumpObj(res));
});
