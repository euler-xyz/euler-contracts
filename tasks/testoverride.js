let doSkipFork;

subtask("test:get-test-files")
    .setAction(async () => {
        const files = await runSuper()

        return files.sort((a, b) => {
            if (a.includes('-fork')) return 1;
            if (b.includes('-fork')) return -1;
            return a.localeCompare(b);
        }).filter(f => !doSkipFork || !f.includes('-fork'));
    });

task("test")
    .addFlag("skipFork", "Skip tests on mainnet fork")
    .setAction(({ skipFork }) => {
        doSkipFork = skipFork;
        return runSuper();
    });
