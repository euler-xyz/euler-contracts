const et = require('./lib/eTestLib');
const child_process = require("child_process");

const hugeAmount = et.eth(9999999999);
const maxSaneAmount = ethers.BigNumber.from(2).pow(112).sub(1);

et.testSet({
    desc: "miscellaneous",

    preActions: ctx => [],
})


.test({
    desc: "only trusted sender can call dispatch",
    actions: ctx => [
        { send: 'euler.dispatch', expectError: 'e/sender-not-trusted' },
    ],
})


.test({
    desc: "invalid subaccount",
    actions: ctx => [
        { from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, hugeAmount.mul(10)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [257, 1], expectError: 'e/sub-account-id-too-big' },
    ],
})


.test({
    desc: "module implementation address, git commit",
    actions: ctx => [
        { call: 'euler.moduleIdToImplementation', args: [et.moduleIds.INSTALLER], onResult: async (r) => {
          et.assert(r === ctx.contracts.modules.installer.address);

          let gitCommit = (await ctx.contracts.modules.installer.moduleGitCommit()).substr(-40);

          let expectedGitCommit = child_process.execSync('git rev-parse HEAD').toString().trim();

          et.expect(gitCommit).to.equal(expectedGitCommit);
        }, },
    ],
})


.test({
    desc: "get underlying from e/dTokens",
    actions: ctx => [
        { call: 'markets.eTokenToUnderlying', args: [ctx.contracts.eTokens.eTST.address], assertEql: ctx.contracts.tokens.TST.address, },
        { call: 'markets.dTokenToUnderlying', args: [ctx.contracts.dTokens.dTST.address], assertEql: ctx.contracts.tokens.TST.address, },
    ],
})


.test({
    desc: "get price, market not activated",
    actions: ctx => [
        { call: 'exec.getPrice', args: [ctx.contracts.tokens.TST4.address], expectError: 'e/market-not-activated'},
    ],
})


.test({
    desc: "get price of pegged asset",
    actions: ctx => [
        { call: 'exec.getPriceFull', args: [ctx.contracts.tokens.WETH.address], onResult: r => et.equals(r.currPrice, et.eth(1))},
    ],
})


.test({
  desc: "gigantic reserves",
  actions: ctx => [
        { action: 'setReserveFee', underlying: 'TST', fee: 0.9, },
        { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

        { from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, hugeAmount.mul(10)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, hugeAmount.mul(10)], },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet3.address, hugeAmount.mul(10)], },
        { from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, hugeAmount.mul(10)], },
        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },


        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, hugeAmount], },
        { action: 'checkpointTime', },

        { call: 'dTokens.dTST.totalSupply', args: [], equals: ['9999999999.0', .1], },

        // dTokens totalSupply is increasing, but is not being stored (totalSupply is a view method):
        { action: 'jumpTimeAndMine', time: 10, },
        { call: 'dTokens.dTST.totalSupply', args: [], equals: ['10000000316.1', .1], },

        // But after reserves can no longer be stored, the increase will fail and it is stuck at the stored level:
        { action: 'jumpTimeAndMine', time: 1000000000, },
        { call: 'dTokens.dTST.totalSupply', args: [], equals: ['9999999999.0', .1], },
  ],
})



.test({
    desc: "install module with id zero",
    actions: ctx => [
        { action: 'installTestModule', id: 0, expectError: 'e/create-proxy/invalid-module', }
    ],
})


.test({
    desc: "_createProxy for internal module",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        { cb: () => ctx.contracts.testModule.testCreateProxyOnInternalModule(), expectError: 'e/create-proxy/internal-module', },
    ],
})


.test({
    desc: "decreaseBorrow and transferBorrow more than owed",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        { from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, et.MaxUint256.sub(1)], },
        { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], expectError: 'e/amount-too-large-to-encode', },
        // call path: eToken.deposit > increaseBalance > encodeAmount for user and reserve > amount <= MAX_SANE_AMOUNT
        // initial deposit reverts because default reserve balance + MAX_SANE_AMOUNT > MAX_SANE_AMOUNT
        // when we create new market, this line is executed: assetStorage.totalBalances = encodeAmount(INITIAL_RESERVES);
        { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount.sub(et.BN(et.DefaultReserve))], },
        // check balance to confirm that user balance decreases by max sane amount
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], equals: [et.formatUnits(maxSaneAmount), '0.000000000001'], },
        { call: 'eTokens.eTST.totalSupply', equals: et.formatUnits(maxSaneAmount), },
        { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
        { from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet3.address, et.MaxUint256.sub(1)], },
        { from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
        // the same revert error applies to TST2 market maxSaneAmount deposit
        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, maxSaneAmount], expectError: 'e/amount-too-large-to-encode', },
        { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, maxSaneAmount.sub(et.BN(et.DefaultReserve))], },

        { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },

        { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, et.eth(10)], },
        { cb: () => ctx.contracts.testModule.testDecreaseBorrow(ctx.contracts.eTokens.eTST.address, ctx.wallet3.address, et.eth(11)),
            expectError: 'e/repay-too-much', 
        },

        { cb: () => ctx.contracts.testModule.testTransferBorrow(ctx.contracts.eTokens.eTST.address, ctx.wallet3.address, ctx.wallet.address, et.eth(11)),
            expectError: 'e/insufficient-balance', 
        },
    ],
})


.test({
    desc: "emit via proxy fail",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        { cb: () => ctx.contracts.testModule.testEmitViaProxyTransfer(ctx.contracts.euler.address, et.AddressZero, et.AddressZero, 1),
            expectError: 'e/log-proxy-fail', },
        { cb: () => ctx.contracts.testModule.testEmitViaProxyApproval(ctx.contracts.euler.address, et.AddressZero, et.AddressZero, 1),
            expectError: 'e/log-proxy-fail', },
    ],
})



.test({
    desc: "emit generic events via proxy",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },

        { send: 'testModule.testProxyLogs', args: [],
          onRawLogs: rawLogs => {
              for (let i = 0; i < 5; i++) {
                  et.expect(rawLogs[i].topics.length).to.equal(i);

                  for (let j = 0; j < i; j++) {
                      et.expect(ethers.BigNumber.from(rawLogs[i].topics[j]).toNumber()).to.equal(j + 1);
                  }

                  et.expect(Buffer.from(rawLogs[i].data.substr(2), 'hex').toString()).to.equal('hello');
              }
          },
        },
    ],
})



.test({
    desc: "call dispatch with no data",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        { cb: () => ctx.contracts.testModule.testDispatchEmptyData(),
            expectError: 'e/input-too-short', },
    ],
})


.test({
    desc: "unrecognized eToken / dToken caller",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        { cb: () => ctx.contracts.testModule.testUnrecognizedETokenCaller(),
            expectError: 'e/unrecognized-etoken-caller', },
        { cb: () => ctx.contracts.testModule.testUnrecognizedDTokenCaller(),
            expectError: 'e/unrecognized-dtoken-caller', },
    ],
})


.test({
    desc: "getPrice pool throws other",
    actions: ctx => [
        { send: 'uniswapPools.TST/WETH.mockSetThrowOther', args: [true], },
        { action: 'getPrice', underlying: 'TST', expectError: 'OTHER', },
    ],
})


.test({
    desc: "getPrice pool throws old",
    actions: ctx => [      
        { send: 'uniswapPools.TST/WETH.mockSetThrowOld', args: [true], },
        { action: 'getPrice', underlying: 'TST', expectError: 'OLD', },
    ],
})


.test({
    desc: "getPrice unknown pricing type",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        () => ctx.contracts.testModule.setPricingType(ctx.contracts.eTokens.eTST.address, 99),
        { action: 'getPrice', underlying: 'TST', expectError: 'e/unknown-pricing-type', },
    ],
})


.test({
    desc: "revertBytes bubbles up custom errors",
    actions: ctx => [
        { action: 'installTestModule', id: 100, },
        async () => {
            try {
                await ctx.contracts.testModule.testRevertBytesCustomError(123, 'test message');
            } catch (e) {
                const error = ctx.contracts.testModule.interface.decodeErrorResult('CustomError', e.data)
                et.expect(error.payload.code).to.equal(123);
                et.expect(error.payload.message).to.equal('test message');
                return;
            }
            throw new Error("Tx did not revert");
        },
    ],
})


.run();
