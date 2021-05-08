const et = require('./lib/eTestLib');

et.testSet({
    desc: "getting and setting governor admin and IRM",
})


.test({
    desc: "retrieve current governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "successfully update and retrieve new governor admin",
    actions: ctx => [
        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [ctx.wallet2.address], },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet2.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should revert if non governor admin tries to set new governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet2, send: 'installer.setGovernorAdmin', args: [ctx.wallet3.address], expectError: 'e/installer/unauthorized', },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should not allow setting zero address as governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [et.AddressZero], expectError: 'e/installer/bad-gov-addr', },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should revert if non governor admin tries to set IRM_ZERO for TST token",
    actions: ctx => [
        { from: ctx.wallet2, send: 'governance.setIRM', args: [ctx.contracts.tokens.TST.address, '2000000', et.HashZero], expectError: 'e/gov/unauthorized', },
    ],
})


.test({
    desc: "should update governor admin, set IRM to IRM_ZERO for TST token and retrieve IRM",
    actions: ctx => [
        { from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [ctx.wallet2.address], },

        { from: ctx.wallet2, send: 'governance.setIRM', args: [ctx.contracts.tokens.TST.address, '2000000', et.HashZero], },

        { call: 'markets.getIRM', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect('2000000').to.equal(r);
        }},
    ],
})


.test({
    desc: "should set IRM to IRM_LINEAR_RECURSIVE for TST token and retrieve IRM",
    actions: ctx => [
        // IRM_LINEAR
        { call: 'markets.getIRM', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect('2000100').to.equal(r);
        }},
        // set IRM_LINEAR_RECURSIVE for TST token
        { from: ctx.wallet, send: 'governance.setIRM', args: [ctx.contracts.tokens.TST.address, '2000101', et.HashZero], },
        
        { call: 'markets.getIRM', args: [ctx.contracts.tokens.TST.address], onResult: r => {
            et.expect('2000101').to.equal(r);
        }},
    ],
})


.test({
    desc: "should not set IRM to IRM_ZERO for zero address",
    actions: ctx => [
        { from: ctx.wallet, send: 'governance.setIRM', args: [et.AddressZero, '2000000', et.HashZero], expectError: 'e/gov/underlying-not-activated', },
    ],
})


.run();
