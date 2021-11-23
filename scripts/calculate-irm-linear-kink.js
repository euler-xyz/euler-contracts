const ethers = require('ethers');

if (process.argv.length !== 6) {
    console.log("Usage: calculate-irm-linear-kink.js <baseIr> <kinkIr> <maxIr> <kink>");
    process.exit(1);
}

let origBaseIr = process.argv[2];
let origKinkIr = process.argv[3];
let origMaxIr = process.argv[4];
let origKink = process.argv[5];

let baseIr = parseIr(origBaseIr);
let kinkIr = parseIr(origKinkIr);
let maxIr = parseIr(origMaxIr);
let kink = parseFloat(origKink) / 100;

if (kink < 0 || kink > 1) throw(`bad kink`);
if (baseIr.gt(kinkIr)) throw(`baseIr > kinkIr`);
if (kinkIr.gt(maxIr)) throw(`kinkIr > maxIr`);


kink = Math.floor(kink * 2**32);

let slope1 = kinkIr.sub(baseIr).div(kink);
let slope2 = maxIr.sub(kinkIr).div(2**32 - kink);

console.log(`            // Base=${origBaseIr}% APY,  Kink(${origKink}%)=${origKinkIr}% APY  Max=${origMaxIr}% APY`);
console.log(`            ${baseIr.toString()}, ${slope1.toString()}, ${slope2.toString()}, ${kink}`);




function parseIr(p) {
    p = parseFloat(p) / 100;
    p = Math.log(1 + p);
    return ethers.BigNumber.from(Math.floor(p * 1e9))
           .mul(ethers.BigNumber.from(10).pow(27 - 9))
           .div(365.2425 * 86400);
}
