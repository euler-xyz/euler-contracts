const fs = require("fs");
const child_process = require("child_process");


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
    .addOptionalParam("output")
    .addFlag("html")
    .setAction(async (args) => {
        const fetch = requireChecked("cross-fetch");

        if (!process.env.ETHERSCAN_API_KEY) throw(`need ETHERSCAN_API_KEY env variable`);

        let res1 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr1}&apikey=${process.env.ETHERSCAN_API_KEY}`);
        let data1 = await res1.json();

        let res2 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr2}&apikey=${process.env.ETHERSCAN_API_KEY}`);
        let data2 = await res2.json();

        let patch = await processDiff(extractEtherscanResult(data1), extractEtherscanResult(data2));
        if (args.html) {
            patch = htmlifyPatch(patch, {
                contract: args.contract,
                before: { type: 'etherscan', addr: args.addr1, },
                after: { type: 'etherscan', addr: args.addr2, },
            });
        }

        if (args.output) fs.writeFileSync(args.output, patch);
        else console.log(patch);
    });


task("verification:diff-contract-from-repo")
    .addPositionalParam("contract")
    .addPositionalParam("addr")
    .addOptionalParam("output")
    .addFlag("html")
    .setAction(async (args) => {
        const fetch = requireChecked("cross-fetch");

        if (!process.env.ETHERSCAN_API_KEY) throw(`need ETHERSCAN_API_KEY env variable`);

        let res1 = await fetch(`https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${args.addr}&apikey=${process.env.ETHERSCAN_API_KEY}`);
        let data1 = await res1.json();

        let data2 = await run('verify:get-minimum-build', { sourceName: args.contract, });

        let patch = await processDiff(extractEtherscanResult(data1), data2.input);
        if (args.html) {
            patch = htmlifyPatch(patch, {
                contract: args.contract,
                before: { type: 'etherscan', addr: args.addr, },
                after: { type: 'repo', },
            });
        }

        if (args.output) fs.writeFileSync(args.output, patch);
        else console.log(patch);
    });


function extractEtherscanResult(data) {
    if (data.status !== "1") throw(`Etherscan error: ${data}`);

    let source = data.result[0].SourceCode;
    let unpacked = JSON.parse(source.substr(1, source.length - 2));
    return unpacked;
}


async function processDiff(data1, data2) {
    const Diff = requireChecked("diff");

    let patch = '';

    let sourcesSeen = {};

    for (let source of Object.keys(data1.sources)) {
        sourcesSeen[source] = true;

        let file1 = data1.sources[source].content;
        let file2 = (data2.sources[source] || '').content;

        if (file1 === file2) continue;

        patch += Diff.createPatch(source, file1, file2, '', '');
    }

    for (let source of Object.keys(data2.sources)) {
        if (sourcesSeen[source]) continue;

        patch += Diff.createPatch(source, '', data2.sources[source].content, '', '');
    }

    return patch;
}

function htmlifyPatch(patch, opts) {
    const diff2html = requireChecked('diff2html');

    let renderState = (s) => {
        if (s.type === 'etherscan') {
            return `contract <a href="https://etherscan.io/address/${s.addr}#code">${s.addr}</a>`;
        } else if (s.type === 'repo') {
            let commit = child_process.execSync('git log -n1 --format=format:"%H"').toString().trim();
            return `git <a href="https://github.com/euler-xyz/euler-contracts/blob/${commit}/${opts.contract}">${commit}</a>`;
        } else {
            throw `unknown type`;
        }
    };

    let output = `<html>
        <head>
            <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/diff2html/bundles/css/diff2html.min.css" />
        </head>
        <body>
        <div style="margin-bottom: 30px">
            <h1>Euler diff: ${opts.contract}</h1>
            <div>Before: ${renderState(opts.before)}</div>
            <div>After: ${renderState(opts.after)}</div>
        </div>
    `;

    output += diff2html.html(patch);

    output += `</body></html`;

    return output;
}

function requireChecked(pkg) {
    try {
        return require(pkg);
    } catch (e) {
        console.error(`error loading ${pkg}. Run: npm i ${pkg}`);
        process.exit(0);
    }
}
