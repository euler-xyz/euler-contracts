const fs = require("fs");

task("verification:get-build")
    .addPositionalParam("contract")
    .addPositionalParam("outputFile")
    .setAction(async (args) => {
        const minimumBuild = await run('verify:get-minimum-build', {
            sourceName: args.contract,
        });

        fs.writeFileSync(args.outputFile, JSON.stringify(minimumBuild.input) + "\n");
    });
