const et = require('./lib/eTestLib');

et.testSet({
    desc: "getting and setting governor admin",
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
        {from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [ctx.wallet2.address], },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet2.address).to.equal(r);
        }},
    ],
})


.test({
    desc: "should not allow any wallet other than current admin to new governor admin",
    actions: ctx => [
        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},

        {from: ctx.wallet2, send: 'installer.setGovernorAdmin', args: [ctx.wallet3.address], expectError: 'e/installer/unauthorized', },

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

        {from: ctx.wallet, send: 'installer.setGovernorAdmin', args: [et.AddressZero], expectError: 'e/installer/bad-gov-addr', },

        { call: 'governance.getGovernorAdmin', onResult: r => {
            et.expect(ctx.wallet.address).to.equal(r);
        }},
    ],
})

.run();
