const et = require('./lib/eTestLib');

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
    desc: "get module implementation address",
    actions: ctx => [
        { call: 'euler.moduleIdToImplementation', args: [1], onResult: r => {
          et.assert(r === ctx.contracts.modules.installer.address);
        }, },
    ],
})


.test({
    desc: "get etoken underlying",
    actions: ctx => [
        { call: 'markets.eTokenToUnderlying', args: [ctx.contracts.eTokens.eTST.address], onResult: r => {
          et.assert(r === ctx.contracts.tokens.TST.address);
        }, },
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
        { callStatic: 'exec.getPriceFull', args: [ctx.contracts.tokens.WETH.address], onResult: r => et.equals(r.currPrice, et.eth(1))},
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

      { action: 'jumpTimeAndMine', time: 1000000000, },
      { call: 'dTokens.dTST.totalSupply', args: [], expectError: 'e/small-amount-too-large-to-encode'},
  ],
})


.test({
  desc: "gigantic debt",
  actions: ctx => [
      { action: 'setReserveFee', underlying: 'TST', fee: 0.9, },
      { action: 'setIRM', underlying: 'TST', irm: 'IRM_FIXED', },

      { from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, et.MaxUint256.sub(1)], },
      { send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
      { from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, maxSaneAmount], },
      { send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST.address], },
      { from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet3.address, et.MaxUint256.sub(1)], },
      { from: ctx.wallet3, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], },
      { from: ctx.wallet3, send: 'eTokens.eTST2.deposit', args: [0, maxSaneAmount], },
      { from: ctx.wallet3, send: 'markets.enterMarket', args: [0, ctx.contracts.tokens.TST2.address], },


      { from: ctx.wallet3, send: 'dTokens.dTST.borrow', args: [0, hugeAmount.mul(100000)], },
      { action: 'checkpointTime', },
      
      { action: 'jumpTimeAndMine', time: 1000000000, },
      { call: 'dTokens.dTST.totalSupply', args: [], expectError: 'e/debt-amount-too-large-to-encode'},
  ],
})




.run();
