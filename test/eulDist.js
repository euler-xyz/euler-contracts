const et = require('./lib/eTestLib');
const merkleTree = require('./lib/merkle-tree');

et.testSet({
    desc: "EUL distributor",

    preActions: ctx => {
        let actions = [];

        actions.push({ send: 'tokens.EUL.mint', args: [ctx.contracts.eulDistributor.address, et.eth(1000000)], });

        return actions;
    },
})

.test({
    desc: "test merkle dist",
    actions: ctx => [
        { action: 'cb', cb: async () => {
            ctx.stash.dist = [
                {
                    account: '0x315d371453689e66a6bb8b11446893850978a3f2',
                    token: '0xb8117dc9a60db427059d5ae500ba47b754c2f026',
                    claimable: '120.5',
                },
                {
                    account: '0x1981e522d4e97acd6af4b9bb85631753325a7727',
                    token: '0xaf32a095a5355e7489185ad4e47cd8ec91e1f6b3',
                    claimable: '75',
                },
                {
                    account: '0xfa9fcfe4f223d98f3c777e3fdec949835da32240',
                    token: '0x77cb3bdc73ef5884973ccc7368fb3e1f92538dbe',
                    claimable: '1000',
                },
            ];

            ctx.stash.merkleRoot = merkleTree.root(ctx.stash.dist);

            await (await ctx.contracts.eulDistributor.updateRoot(ctx.stash.merkleRoot)).wait();
        }},

        { action: 'cb', cb: async () => {
            for (let item of ctx.stash.dist) {
                let account = item.account;
                let token = item.token;

                let proof = merkleTree.proof(ctx.stash.dist, account, token);

                await (await ctx.contracts.eulDistributor.claim(account, token, proof.item.claimable, proof.witnesses, et.AddressZero)).wait();
            }
        }},
    ],
})

.run();
