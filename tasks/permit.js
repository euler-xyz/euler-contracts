const fs = require('fs');

const nonStandardTokens = {
    '0xc944e90c64b2c07662a292be6244bdf05cda44a7': {
        permitType: 'EIP2612',
        domain: {
            name: "Graph Token",
            version: "0",
            chainId: 1,
            verifyingContract: '0xc944e90c64b2c07662a292be6244bdf05cda44a7',
            salt: '0x51f3d585afe6dfeb2af01bba0889a36c1db03beec88c6a4d0c53817069026afa',
        }
    },
    '0x9d409a0a012cfba9b15f6d4b36ac57a46966ab9a': { // yvBoost
        permitType: 'Packed',
        domain: {
            name: 'Yearn Vault',
            version: '0.3.5', // returned by apiVersion()
            chainId: 1,
            verifyingContract: '0x9d409a0a012cfba9b15f6d4b36ac57a46966ab9a',
        },
    },
    '0xbe1a001fe942f96eea22ba08783140b9dcc09d28': { // Beta
        permitType: 'EIP2612',
        domain: {
            name: 'BETA',
            version: '1',
            chainId: 1,
            verifyingContract: '0xbe1a001fe942f96eea22ba08783140b9dcc09d28',
        },
    },
    '0x24a6a37576377f63f194caa5f518a60f45b42921': { // BANK
        permitType: 'EIP2612',
        domain: {
            name: 'Float Protocol: BANK',
            version: '2',
            chainId: 1,
            verifyingContract: '0x24a6a37576377f63f194caa5f518a60f45b42921',
        },
    },
    '0x7ae1d57b58fa6411f32948314badd83583ee0e8c': { // PAPER
        permitType: 'EIP2612',
        domain: {
            name: 'PAPER',
            version: '1',
            chainId: 1,
            verifyingContract: '0x7ae1d57b58fa6411f32948314badd83583ee0e8c',
        },
    },
    '0x0fd10b9899882a6f2fcb5c371e17e70fdee00c38': { // PUNDIX
        permitType: 'EIP2612',
        domain: {
            name: 'PUNDIX',
            version: '1',
            chainId: 1,
            verifyingContract: '0x0fd10b9899882a6f2fcb5c371e17e70fdee00c38'
        },
    },

    '0x33349b282065b0284d756f0577fb39c158f935e6': 'non-standard', // MPL - non standard, using 'amount' instead of 'value' in permit typehash:
    // {
    //     permitType: 'EIP2612',
    //     permitTypeHash: '0xfc77c2b9d30fe91687fd39abb7d16fcdfe1472d065740051ab8b13e4bf4a617f',  
    //     domain: {
    //         name: 'Maple Token',
    //         version: '1',
    //         chainId: 1,
    //         verifyingContract: '0x33349b282065b0284d756f0577fb39c158f935e6'
    //     },
    //     comment: 'Using amount insead of value in permit typehash',
    // },
    '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9': 'non-standard', // AAVE - using _nonces instead of nonces
    // {
    //     permitType: 'EIP2612',
    //     domain: {
    //         name: 'Aave Token',
    //         version: '1',
    //         chainId: 1,
    //         verifyingContract: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9'
    //     },
    //     comment: 'using _nonces',
    // },
    
    '0x7f0693074f8064cfbcf9fa6e5a3fa0e4f58ccccf': 'not supported', // GM - permit handles NFTs
    '0xcc7ab8d78dba187dc95bf3bb86e65e0c26d0041f': 'not supported', // SPACE - domain separator not initialized properly
    '0x6100dd79fcaa88420750dcee3f735d168abcb771': 'not supported', // OS - Ethereans - domain separator not recognized - wasn't debugged further - IGNORED
    '0xd69f306549e9d96f183b1aeca30b8f4353c2ecc3': 'not supported', // MCHC - domain typehash doesn't match domain separator (typehash doesn't include version)
    '0x1ceb5cb57c4d4e2b2433641b95dd330a33185a44': 'not supported', // KP3R - non standard encoding of typehashes ('uint' alias used)
    '0x226f7b842e0f0120b7e194d05432b3fd14773a9d': 'not supported', // UNN - contract not verified on etherscan
}

task("permit:detect", "Detect token permit support")
    .addPositionalParam("token", "Token address")
    .addFlag("quiet", "Suppress logging")
    .setAction(async ({ token, quiet }) => {
        if (network.name !== 'localhost') throw 'Only localhost!';

        const signer = (await ethers.getSigners())[0];
        const signTypedData = signer._signTypedData
            ? signer._signTypedData.bind(signer)
            : signer.signTypedData.bind(signer);
        const TypedDataEncoder = ethers.utils._TypedDataEncoder || ethers.utils.TypedDataEncoder;

        const permitTypeHash = '0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9'; // EIP2612
        const permitAllowedTypeHash = '0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb'; // DAI and the like
        const abiCommon = [
            'function name() external view returns (string)',
            'function version() external view returns (string)',
            'function DOMAIN_SEPARATOR() external view returns (bytes32)',
            'function DOMAIN_TYPEHASH() external view returns (bytes32)',
            'function nonces(address owner) external view returns (uint)',
            'function PERMIT_TYPEHASH() external view returns (bytes32)',
            'function allowance(address owner, address spender) external view returns (uint256)'
        ]
        const abiPermit = [
            ...abiCommon,
            'function permit(address owner, address spender, uint value, uint deadline, uint8 v, bytes32 r, bytes32 s)',
        ];
        const abiPermitAllowed = [
            ...abiCommon,
            'function permit(address holder, address spender, uint256 nonce, uint256 expiry, bool allowed, uint8 v, bytes32 r, bytes32 s)',
        ];
        const abiPermitPacked = [
            ...abiCommon,
            'function permit(address owner, address spender, uint value, uint deadline, bytes signature)',
        ];
        const typesPermit = {
            "Permit": [{
                "name": "owner",
                "type": "address"
                },
                {
                  "name": "spender",
                  "type": "address"
                },
                {
                  "name": "value",
                  "type": "uint256"
                },
                {
                  "name": "nonce",
                  "type": "uint256"
                },
                {
                  "name": "deadline",
                  "type": "uint256"
                }
              ],
        };
        const typesPermitAllowed = {
            "Permit": [{
                "name": "holder",
                "type": "address"
                },
                {
                  "name": "spender",
                  "type": "address"
                },
                {
                  "name": "nonce",
                  "type": "uint256"
                },
                {
                  "name": "expiry",
                  "type": "uint256"
                },
                {
                  "name": "allowed",
                  "type": "bool"
                }
              ],
        };
        const spender = '0x'+'a'.repeat(40);
        const value = ethers.utils.parseEther('1.23');

        const result = { logs: [] };

        const handleResult = () => {
            if (!quiet) {
                if (result.permitType) {
                    console.log("DETECTED:", result.permitType, 'type');
                    console.log(result.domain);
                    if (result.notice) console.log('Notice: ', result.notice);
                } else if (!result.domainSeparator && !result.typeHash && !result.unexpectedError) {
                    console.log("No permit support detected");
                    console.log(result);
                } else {
                    console.log("ERROR");
                    console.log(result);
                }
            }
            return result;
        }

        const testDomain = async (testName, domain) => {
            if (!domain) return;

            if (result.domainSeparator && TypedDataEncoder.hashDomain(domain) !== result.domainSeparator) {
                result.logs.push(`${testName}: Unrecognized domain separator `);
            }

            // are you EIP2612?
            try {
                contract = new ethers.Contract(token, abiPermit, signer)
                const deadline = ethers.constants.MaxUint256;

                const rawSignature = await signTypedData(domain, typesPermit, {
                    owner: signer.address,
                    spender,
                    value,
                    nonce,
                    deadline,
                });

                const { r, s, v } = ethers.utils.splitSignature(rawSignature);

                await contract.permit(signer.address, spender, value, deadline, v, r, s);

                const allowance = await contract.allowance(signer.address, spender);
                if (allowance.eq(value)) {
                    result.permitType = 'EIP2612';
                    result.domain = domain;
                    return;
                } else {
                    result.logs.push(`${testName}: EIP2612 allowance doesn't match value`);
                }
            } catch (e) {
                if (!e.message.includes('Transaction reverted without a reason string')) {
                    result.logs.push(`${testName}: EIP2612 error: ${e}`);
                    result.unexpectedError = true;
                }
            }

            // are you packed signature?
            try {
                contract = new ethers.Contract(token, abiPermitPacked, signer)
                const deadline = ethers.constants.MaxUint256;

                const rawSignature = await signTypedData(domain, typesPermit, {
                    owner: signer.address,
                    spender,
                    value,
                    nonce,
                    deadline,
                });

                await contract.permit(signer.address, spender, value, deadline, rawSignature);

                const allowance = await contract.allowance(signer.address, spender);
                if (allowance.eq(value)) {
                    result.permitType = 'Packed';
                    result.domain = domain;
                    return;
                } else {
                    result.logs.push(`${testName}: Packed type allowance doesn't match value`);
                }
            } catch (e) {
                if (!e.message.includes('Transaction reverted without a reason string')) {
                    result.logs.push(`${testName}: Packed type error: ${e}`);
                    result.unexpectedError = true;
                }
            }

            // are you `allowed` type permit?
            try {
                contract = new ethers.Contract(token, abiPermitAllowed, signer)
                const expiry = ethers.constants.MaxUint256;

                const rawSignature = await signTypedData(domain, typesPermitAllowed, {
                    holder: signer.address,
                    spender,
                    nonce,
                    expiry,
                    allowed: true,
                });

                const { r, s, v } = ethers.utils.splitSignature(rawSignature);

                await contract.permit(signer.address, spender, nonce, expiry, true, v, r, s);

                const allowance = await contract.allowance(signer.address, spender);

                if (allowance.eq(ethers.constants.MaxUint256)) {
                    result.permitType = 'Allowed';
                    result.domain = domain;
                    return;
                } else {
                    result.logs.push(`${testName}: Allowed type allowance is not max uint`);
                }
            } catch (e) {
                if (!e.message.includes('Transaction reverted without a reason string')) {
                    result.logs.push(`${testName}: Allowed type error: ${e}`);
                    result.unexpectedError = true;
                }
            }
        }

        if (nonStandardTokens[token] === 'not supported' || nonStandardTokens[token] === 'non-standard') return handleResult();
        
        let contract;
        contract = new ethers.Contract(token, abiPermit, signer)
        try {
            result.typeHash = await contract.PERMIT_TYPEHASH();
            result.typeHash = {[permitTypeHash]: 'EIP2612', [permitAllowedTypeHash]: 'Allowed'}[result.typeHash] || result.typeHash;
        } catch {};

        try {
            result.domainSeparator = await contract.DOMAIN_SEPARATOR();
        } catch (e) {
            result.logs.push('No DOMAIN_SEPARATOR');
        };

        try {
            nonce = await contract.nonces(signer.address);
        } catch (e) {
            result.logs.push(`Nonces call failed ${e}`);
            return handleResult();
        }


        if (nonStandardTokens[token]) await testDomain('NON-STANDARD', nonStandardTokens[token].domain);
        if (result.permitType) return handleResult();

        let version = "1";
        try {
            version = await contract.version();
        } catch {}

        let contractName = await contract.name();

        await testDomain('FULL', {
            name: contractName,
            version,
            chainId: 1,
            verifyingContract: token,
        });
        
        if (result.permitType) return handleResult();
        
        await testDomain('NO VERSION', {
            name: contractName,
            chainId: 1,
            verifyingContract: token,
        });

        if (result.permitType) return handleResult();

        await testDomain('VERSION 1.0', {
            name: contractName,
            chainId: 1,
            version: "1.0",
            verifyingContract: token,
        });

        if (result.permitType) return handleResult();

        await testDomain('NO VERSION NO NAME', {
            chainId: 1,
            verifyingContract: token,
        });
 
        return handleResult();
});

task("permit:update-tokenlist", "Detect token permit support on all tokens from Euler token list. Expects euler-tokenlist project in the same parent folder.")
    .addFlag("all", "Run detection on all tokens, including those already processed.")
    .setAction(async ({ all }) => {
        const filePath = `${__dirname}/../../euler-tokenlist/euler-tokenlist.json`;
        const errorsPath = './detect-permit-errors.log';
        const tokenList = require(filePath);

        const counts = { yes: 0, no: 0, error: 0 };
        fs.writeFileSync(errorsPath, '');

        for (let i = 0; i < tokenList.tokens.length; i++) {
            if (tokenList.tokens[i].permit && !all) continue;

            const result = await hre.run('permit:detect', { quiet: true, token: tokenList.tokens[i].address });
            if (result.permitType) {
                console.log(`${tokenList.tokens[i].symbol}: DETECTED ${result.permitType}`);
                tokenList.tokens[i].permit = {
                    type: result.permitType,
                    domain: result.domain,
                }
                fs.writeFileSync(filePath, JSON.stringify(tokenList, null, 2));
                counts.yes++;
                continue;
            }
            if (!result.domainSeparator && !result.typeHash && !result.unexpectedError) {
                console.log(`${tokenList.tokens[i].symbol}: NOT DETECTED`);
                tokenList.tokens[i].permit = 'not supported';
                fs.writeFileSync(filePath, JSON.stringify(tokenList, null, 2));
                counts.no++;
                continue;
            }
            const error = {
                token: tokenList.tokens[i].symbol,
                address: tokenList.tokens[i].address,
                result
            }
            console.log('ERROR', error);
            fs.appendFileSync(errorsPath, JSON.stringify(error, null, 2) + '\n\n\n');
            counts.error++;
        }
        console.log("DETECTED TOTAL:", counts.yes);
        console.log("NO SUPPORT TOTAL:", counts.no);
        console.log("ERRORS TOTAL:", counts.error);
});