const et = require('./lib/eTestLib');

et.testSet({
    desc: "malicious token",

    preActions: ctx => {
        let actions = [];

        actions.push({ from: ctx.wallet, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        actions.push({ from: ctx.wallet, send: 'tokens.TST.mint', args: [ctx.wallet.address, et.eth(200)], });
        actions.push({ from: ctx.wallet, send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], });
        // actions.push({ from: ctx.wallet, send: 'tokens.TST2.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        // actions.push({ from: ctx.wallet, send: 'tokens.TST2.mint', args: [ctx.wallet.address, et.eth(100)], });
        // actions.push({ from: ctx.wallet, send: 'eTokens.eTST2.deposit', args: [0, et.eth(100)], });

        actions.push({ action: 'updateUniswapPrice', pair: 'TST/WETH', price: '.05', });
        // actions.push({ action: 'updateUniswapPrice', pair: 'TST2/WETH', price: '.05', });

        return actions;
    },
})


.test({
    desc: "transfer returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer/return-void', []], },   
        { send: 'eTokens.eTST.withdraw', args: [0, et.eth(100)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(200), },   
    ],
})


.test({
    desc: "transferFrom returns void",
    actions: ctx => [
        { send: 'tokens.TST.configure', args: ['transfer-from/return-void', []], },   
        { send: 'eTokens.eTST.deposit', args: [0, et.eth(100)], },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: et.eth(200), },   
        { call: 'tokens.TST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },   
    ],
})


.run();
