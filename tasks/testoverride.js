let doSkipFork;

subtask("test:get-test-files")
    .setAction(async () => {
        let files = await runSuper();

        if (doSkipFork || process.env.COVERAGE) {
            files = files.filter(f => !(f.includes('swap1inch') || f.includes('swapUni') || f.includes('permitFork')));
        }
        return files;
    });

task("test")
    .addFlag("skipfork", "Skip tests on mainnet fork")
    .setAction(({ skipfork }) => {
        if (!process.env.ALCHEMY_API_KEY) {
            console.log('\nALCHEMY_API_KEY environment variable not found. Skipping mainnet fork tests...\n');
            doSkipFork = true;
        } else {
            doSkipFork = skipfork;
        }

        return runSuper();
    });

task("coverage")
    .setAction(() => {
        console.log("\nMainnet fork tests currently not supported, skipping swap1inch, swapUni and permitFork tests...\n");
        process.env.COVERAGE = true;
        return runSuper();
    });
