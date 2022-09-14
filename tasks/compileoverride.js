// patch compilation ABIs; for functions with "staticDelegate" modifier, set state mutability to "view"
// WARNING functions are matched by name only - all overloaded functions will also be patched

// Also, verify that all module functions have nonReentrant or reentrantOK modifiers in place.

subtask("compile:solidity:emit-artifacts").setAction(({ output }) => {
  const deepFindByProp = (o, key, val, path, cb) => {
    if (typeof o !== "object" || o === null) return;
    if (o[key] === val) return cb(o, path);
    Object.keys(o).forEach((k) => deepFindByProp(o[k], key, val, [...path, k], cb));
  };

  let numErrors = 0;

  deepFindByProp(output.sources, "kind", "function", [], (astFun, astPath) => {
    const contractFile = astPath[0];

    if (
      astFun.modifiers &&
      astFun.modifiers.length > 0 &&
      astFun.modifiers.find(
        (m) => m.modifierName && m.modifierName.name === "staticDelegate"
      )
    ) {
      deepFindByProp(
        output.contracts[contractFile],
        "type",
        "function",
        [],
        (abiFun, abiPath) => {
          if (abiFun.name === astFun.name) {
            abiFun.stateMutability = "view";

            const contractName = abiPath[0];
            if (process.env.VERBOSE) {
              console.log(
                `${contractName}.${abiFun.name}: Patched ABI, state mutablity set to "view"`
              );
            }
          }
        }
      );
    }

    if ((contractFile.startsWith('contracts/modules/') || contractFile.match('^contracts/[^/]+[.]sol$')) &&
        (astFun.visibility == 'external' || astFun.visibility == 'public') &&
        (astFun.stateMutability !== 'view' && astFun.stateMutability !== 'pure') &&
        astFun.implemented && // Ignore interface{} functions
        (contractFile !== 'contracts/modules/RiskManager.sol' && contractFile !== 'contracts/BaseIRM.sol') && // Internal modules
        (contractFile !== 'contracts/PToken.sol') // Not used in module system
    ) {

        const found = astFun.modifiers.find(m => m.modifierName && (m.modifierName.name === 'nonReentrant' || m.modifierName.name === 'reentrantOK' || m.modifierName.name === 'staticDelegate'));

        if (!found) {
          numErrors++;
          console.log(`ERROR: No reentrancy modifier found: ${contractFile}:${astFun.name}`);
        }
    }
  });

  if (numErrors > 0) throw Error(`${numErrors} compilation errors`);

  return runSuper();
});
