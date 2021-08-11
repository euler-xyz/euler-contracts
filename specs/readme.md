- Remove all `hardhat/console` imports
- from `/specs` folder run
```bash
certoraRun --loop_iter=2 ./harness/InstallerHarness.sol:InstallerHarness --verify InstallerHarness:Installer.spec
```