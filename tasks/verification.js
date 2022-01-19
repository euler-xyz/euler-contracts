const fs = require("fs");
const fetch = require("cross-fetch");
const Diff = require("diff");


task("verification:get-build")
    .addPositionalParam("contract")
    .addPositionalParam("outputFile")
    .setAction(async (args) => {
        const minimumBuild = await run('verify:get-minimum-build', {
            sourceName: args.contract,
        });

        fs.writeFileSync(args.outputFile, JSON.stringify(minimumBuild.input) + "\n");
    });


task("verification:diff-contracts")
    .addPositionalParam("addr1")
    .addPositionalParam("addr2")
    .setAction(async (args) => {
        if (!process.env.ETHERSCAN) throw(`need ETHERSCAN env variable`);

        let res1 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr1}&apikey=${process.env.ETHERSCAN}`);
        let data1 = await res1.json();

        let res2 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr2}&apikey=${process.env.ETHERSCAN}`);
        let data2 = await res2.json();

        await processDiff(extractEtherscanResult(data1), extractEtherscanResult(data2));
    });


task("verification:diff-contract-from-repo")
    .addPositionalParam("contract")
    .addPositionalParam("addr")
    .setAction(async (args) => {
        if (!process.env.ETHERSCAN) throw(`need ETHERSCAN env variable`);

        let res1 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr}&apikey=${process.env.ETHERSCAN}`);
        let data1 = await res1.json();

        let data2 = await run('verify:get-minimum-build', { sourceName: args.contract, });

        await processDiff(extractEtherscanResult(data1), data2.input);
    });


function extractEtherscanResult(data) {
    if (data.status !== "1") throw(`Etherscan error: ${data}`);

    let source = data.result[0].SourceCode;
    let unpacked = JSON.parse(source.substr(1, source.length - 2));
    return unpacked;
}


async function processDiff(data1, data2) {
    let sourcesSeen = {};

    for (let source of Object.keys(data1.sources)) {
        sourcesSeen[source] = true;

        let file1 = data1.sources[source].content;
        let file2 = (data2.sources[source] || '').content;

        if (file1 === file2) continue;

        console.log(Diff.createPatch(source, file1, file2, '', ''));
    }

    for (let source of Object.keys(data2.sources)) {
        if (sourcesSeen[source]) continue;

        console.log(Diff.createPatch(source, '', data2.sources[source].content, '', ''));
    }
}
