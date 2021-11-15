let doSkipFork;

subtask("test:get-test-files")
    .setAction(async () => {
        const files = await runSuper();

        return files.filter(f => !doSkipFork || !f.includes('swap-1inch'));
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
        console.log("\nMainnet fork tests currently not supported, skipping 1inch swap tests...\n");
        doSkipFork = true;
        process.env.COVERAGE = true;
        return runSuper();
    });
