// patch compilation ABIs; for functions with "staticDelegate" modifier, set state mutability to "view"
// WARNING all overriden functions will also be patched
subtask("compile:solidity:emit-artifacts").setAction(({ output }) => {
  const deepFindByProp = (o, key, val, path, cb) => {
    if (typeof o !== "object" || o === null) return;
    if (o[key] === val) return cb(o, path);
    Object.keys(o).forEach((k) => deepFindByProp(o[k], key, val, [...path, k], cb));
  };

  deepFindByProp(output.sources, "kind", "function", [], (astFun, astPath) => {
    if (
      astFun.modifiers &&
      astFun.modifiers.length > 0 &&
      astFun.modifiers.find(
        (m) => m.modifierName && m.modifierName.name === "staticDelegate"
      )
    ) {
      const contractFile = astPath[0];
      deepFindByProp(
        output.contracts[contractFile],
        "type",
        "function",
        [],
        (abiFun, abiPath) => {
          if (abiFun.name === astFun.name) {
            abiFun.stateMutability = "view";

            const contractName = abiPath[0];
            console.log(
              `${contractName}.${abiFun.name}: Patched ABI, state mutablity set to "view"`
            );
          }
        }
      );
    }
  });

  return runSuper();
});
