let doSkipFork;

subtask("test:get-test-files")
    .setAction(async () => {
        let files = await runSuper();

        if (doSkipFork || process.env.COVERAGE) {
            files = files.filter(f => !(f.includes('swap1inch') || f.includes('permitFork') || f.includes('chainlinkPriceFeed-integration')));
        }
        return files;
    });

task("test")
    .addFlag("skipFork", "Skip tests on mainnet fork")
    .setAction(({ skipFork }) => {
        if (!process.env.ALCHEMY_API_KEY) {
            console.log('\nALCHEMY_API_KEY environment variable not found. Skipping mainnet fork tests...\n');
            doSkipFork = true;
        } else {
            doSkipFork = skipFork;
        }

        return runSuper();
    });

task("coverage")
    .setAction(() => {
        console.log("\nMainnet fork tests currently not supported, skipping swap1inch and permitFork tests...\n");
        process.env.COVERAGE = true;
        return runSuper();
    });
