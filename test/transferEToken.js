const et = require('./lib/eTestLib');

et.testSet({
    desc: "transfer eToken balances, without interest",

    preActions: ctx => {
        let actions = [];

        for (let from of [ctx.wallet, ctx.wallet2, ctx.wallet3]) {
            actions.push({ from, send: 'tokens.TST.mint', args: [from.address, 1000], });
            actions.push({ from, send: 'tokens.TST.approve', args: [ctx.contracts.euler.address, et.MaxUint256,], });
        }

        return actions;
    },
})


.test({
    desc: "basic transfer",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 0, },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, 400], onLogs: allLogs => {
            {
                let logs = allLogs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
                et.expect(logs.length).to.equal(1);
                et.expect(logs[0].name).to.equal('Transfer');
                et.expect(logs[0].args.from).to.equal(ctx.wallet.address);
                et.expect(logs[0].args.to).to.equal(ctx.wallet2.address);
                et.expect(logs[0].args.value.toNumber()).to.equal(400);
            }

            {
                let logs = allLogs.filter(l => l.address === ctx.contracts.euler.address);
                et.expect(logs.length).to.equal(4);
                et.expect(logs[0].name).to.equal('RequestTransferEToken');
                et.expect(logs[1].name).to.equal('Withdraw');
                et.expect(logs[2].name).to.equal('Deposit');
                et.expect(logs[3].name).to.equal('AssetStatus');
            }
        }},

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 600, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 400, },
    ],
})


.test({
    desc: "transfer with zero amount is a no-op",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, 500], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 500, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 500, },

        // no-op, balances of sender and recipient not affected
        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, 0], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(0);
        }}, 
    ],
})


.test({
    desc: "transfer between sub-accounts with zero amount is a no-op",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, 500], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 500, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 500, },

        { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 200], },

        // no-op, balances of sender and recipient not affected
        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), et.getSubAccount(ctx.wallet.address, 255), 0], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(0);
        }},  

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 300, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 200, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 255)], assertEql: 0, },
    ],
})


.test({
    desc: "transfer max",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        // MAX_UINT is *not* a short-cut for this:
        { send: 'eTokens.eTST.transfer', args: [ctx.wallet2.address, et.MaxUint256], expectError: 'e/insufficient-balance', },

        { send: 'eTokens.eTST.transferFromMax', args: [ctx.wallet.address, ctx.wallet2.address], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.to).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.value.toNumber()).to.equal(1000);
        }},

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },

        { send: 'eTokens.eTST.transferFromMax', args: [ctx.wallet.address, ctx.wallet2.address], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(0);
        }},

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 0, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
    ],
})



.test({
    desc: "approval, max",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 1000, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 0, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], expectError: 'insufficient-allowance', },
        { from: ctx.wallet3, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], expectError: 'insufficient-allowance', },

        { from: ctx.wallet2, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, et.MaxUint256], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Approval');
            et.expect(logs[0].args.owner).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet.address);
            et.assert(logs[0].args.value.eq(et.MaxUint256));
        }},
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: et.MaxUint256, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 300], onLogs: logs => {
            logs = logs.filter(l => l.address === ctx.contracts.eTokens.eTST.address);
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].name).to.equal('Transfer');
            et.expect(logs[0].args.from).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.to).to.equal(ctx.wallet3.address);
            et.expect(logs[0].args.value.toNumber()).to.equal(300);
        }},

        { from: ctx.wallet3, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 100], expectError: 'insufficient-allowance', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 700, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], assertEql: 300, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: et.MaxUint256, },
    ],
})



.test({
    desc: "approval, limited",
    actions: ctx => [
        { from: ctx.wallet2, send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { from: ctx.wallet2, send: 'eTokens.eTST.approve', args: [ctx.wallet.address, 200], onLogs: logs => {
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].address).to.equal(ctx.contracts.eTokens.eTST.address);
            et.expect(logs[0].args.owner).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.value.toNumber()).to.equal(200);
        }},
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 200, },

        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 201], expectError: 'insufficient-allowance', },
        { from: ctx.wallet1, send: 'eTokens.eTST.transferFrom', args: [ctx.wallet2.address, ctx.wallet3.address, 150], onLogs: logs => {
            logs = logs.filter(l => l.name === 'Approval');
            et.expect(logs.length).to.equal(1);
            et.expect(logs[0].address).to.equal(ctx.contracts.eTokens.eTST.address);
            et.expect(logs[0].args.owner).to.equal(ctx.wallet2.address);
            et.expect(logs[0].args.spender).to.equal(ctx.wallet.address);
            et.expect(logs[0].args.value.toNumber()).to.equal(50);
        }},

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet2.address], assertEql: 850, },
        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet3.address], assertEql: 150, },
        { call: 'eTokens.eTST.allowance', args: [ctx.wallet2.address, ctx.wallet.address], assertEql: 50, },
    ],
})



.test({
    desc: "transfer between sub-accounts",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { send: 'eTokens.eTST.transfer', args: [et.getSubAccount(ctx.wallet.address, 1), 700], },
        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), et.getSubAccount(ctx.wallet.address, 255), 400], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 300, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 300, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 255)], assertEql: 400, },

        // Now send some to account 256, which is *not* a sub-account so can't transfer them back out:

        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 255), et.getSubAccount(ctx.wallet.address, 256), 100], },
        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 256), et.getSubAccount(ctx.wallet.address, 2), 50], expectError: 'e/insufficient-allowance', },

        // Finally, transfer some back to primary account:

        { send: 'eTokens.eTST.transferFrom', args: [et.getSubAccount(ctx.wallet.address, 1), ctx.wallet.address, 30], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 330, },
        { call: 'eTokens.eTST.balanceOf', args: [et.getSubAccount(ctx.wallet.address, 1)], assertEql: 270, },
    ],
})


.test({
    desc: "self-transfer with valid amount",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        // revert on self-transfer of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.transfer', args: [ctx.wallet.address, 10], expectError: 'e/self-transfer', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
    ],
})


.test({
    desc: "self-transfer with zero amount",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        // revert on self-transfer of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.transfer', args: [ctx.wallet.address, 0], expectError: 'e/self-transfer', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
    ],
})


.test({
    desc: "self-transfer with max amount exceeding balance",
    actions: ctx => [
        { send: 'eTokens.eTST.deposit', args: [0, 1000], },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },

        // revert on self-transfer of eToken
        { from: ctx.wallet, send: 'eTokens.eTST.transfer', args: [ctx.wallet.address, et.MaxUint256], expectError: 'e/self-transfer', },

        { call: 'eTokens.eTST.balanceOf', args: [ctx.wallet.address], assertEql: 1000, },
    ],
})


.run();
