let doSkipFork;

subtask("test:get-test-files")
    .setAction(async () => {
        let files = await runSuper();

        if (doSkipFork || process.env.COVERAGE) {
            files = files.filter(f => !f.includes('-integration'));
        }
        return files;
    });

task("test")
    .addFlag("skipfork", "Skip tests on mainnet fork")
    .setAction(({ skipfork }) => {
        if (!process.env.ALCHEMY_API_KEY) {
            console.log('\nALCHEMY_API_KEY environment variable not found. Skipping integration tests on mainnet fork...\n');
            doSkipFork = true;
        } else {
            doSkipFork = skipfork;
        }

        return runSuper();
    });

task("coverage")
    .setAction(() => {
        console.log("\nMainnet fork tests currently not supported, skipping tests with `-integration` suffix...\n");
        process.env.COVERAGE = true;
        return runSuper();
    });
