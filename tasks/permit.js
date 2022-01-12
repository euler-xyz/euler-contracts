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

        const result = {};

        const handleResult = () => {
            if (!quiet) {
                if (result.permitType) {
                    console.log("DETECTED:", result.permitType, 'type');
                    console.log(result.domain);
                } else if (!result.domainSeparator && !result.typeHash) {
                    console.log("No permit support");
                } else {
                    console.log("ERROR");
                    console.log(result);
                }
            }
            return result;
        }
        
        let contract;
        contract = new ethers.Contract(token, abiPermit, signer)
        try {
            result.typeHash = await contract.PERMIT_TYPEHASH();
            result.typeHash = {[permitTypeHash]: 'EIP2612', [permitAllowedTypeHash]: 'Allowed'}[result.typeHash] || result.typeHash;
        } catch {};

        try {
            result.domainSeparator = await contract.DOMAIN_SEPARATOR();
        } catch {
            return handleResult();
        };

        // test if default domain values are correct

        let version = "1";
        try {
            version = await contract.version();
        } catch {}

        result.domain = {
            name: await contract.name(),
            version,
            chainId: 1,
            verifyingContract: token,
        };

        if (TypedDataEncoder.hashDomain(result.domain) !== result.domainSeparator) {
            result.error = 'Unrecognized domain separator';
            return handleResult();
        }

        try {
            nonce = await contract.nonces(signer.address);
        } catch (e) {
            result.error = 'Nonces call failed ' + e;
            return handleResult();
        }

        // are you EIP2612?
        try {
            const deadline = ethers.constants.MaxUint256;

            const rawSignature = await signTypedData(result.domain, typesPermit, {
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
            } else {
                result.error = `EIP2612 allowance doesn't match value`;
            }

            return handleResult();
        } catch (e) {
            if (!e.message.includes('Transaction reverted without a reason string'))
                result.error = `EIP2612 error: ${e}`;
        }

        // are you `allowed` type permit?
        try {
            contract = new ethers.Contract(token, abiPermitAllowed, signer)
            const expiry = ethers.constants.MaxUint256;

            const rawSignature = await signTypedData(result.domain, typesPermitAllowed, {
                holder: signer.address,
                spender,
                nonce,
                expiry,
                allowed: true,
            });

            const { r, s, v } = ethers.utils.splitSignature(rawSignature);

            await contract.permit(signer.address, spender, nonce, expiry, true, v, r, s);

            const allowance = await contract.allowance(signer.address, spender);

            if (allowance.eq(ethers.constants.MaxUint256)) 
                result.permitType = 'Allowed';
            else {
                result.error = `${result.error ? `${result.error} & ` : ''}Allowed type error: allowance is not max uint`;
                return handleResult();
            }
        } catch (e) {
            result.error = `${result.error ? `${result.error} & ` : ''}Allowed type error: ${e}`;
        }
        return handleResult();
});