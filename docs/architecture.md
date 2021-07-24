# Euler Contracts Architecture

## Module System

Except for a small amount of dispatching logic (see `Euler.sol`), the contracts are organised into modules, which live in `contracts/modules/`.

There are several reasons why modules are used:

* A proxy indirection layer which is used for dispatching calls from sub-contracts like ETokens and DTokens (see below)
  * Each token must have its own address to conform to ERC-20, even though all storage lives inside the Euler contract
* Contract upgrades
  * Modules can be upgraded, which can immediately upgrade all ETokens (for example)
* Avoid hitting the max contract size limitation of ~24kb

See the file `contracts/Constants.sol` for the registry of module IDs. There are 3 categories of modules:

* **Single-proxy modules**: These are modules that are only accessible by a single address. For example, market activation is done by invoking a function on the single proxy for the Markets module.
* **Multi-proxy modules**: These are modules that have many addresses. For example, each EToken gets an address, but any calls to them are dispatched to the single EToken module instance.
* **Internal modules**: These are modules that are called internally by the Euler system and don't have any public proxies. These are only useful for their upgrade functionality, and the ability to stub in non-production code during testing/development. Examples are the RiskManager and interest rate model (IRM) modules.

Since modules are invoked by delegatecall, they should not have any storage-related initialisation in their constructors. The only thing that should be done in their constructors is to initialise immutable variables, since these are embedded into the contract's bytecode, not storage. Modules also should not define any storage variables. In the rare cases they need private storage (ie interest rate model state), they should use unstructured storage.



### Proxies

Modules cannot be called directly. Instead, they must be invoked through a proxy. All proxies are implemented by the same code: `contracts/Proxy.sol`. This is a very simple contract that forwards its requests to the main Euler contract address, along with the original msg.sender. The call is done with a normal `call()`, so the execution takes place within the Euler contract's storage context, not the proxy's.

Proxies contain the bare minimum amount of logic required for forwarding. This is because they are not upgradeable. They should ideally be small so as to minimise gas costs since many of them will be deployed (at least 2 per market activated).

The Euler contract ensures that all requests to it are from a known trusted proxy address. The only way that addresses can become known trusted is when the Euler contract itself creates them. In this way, the original msg.sender sent by the proxy can be trusted.

The only other thing that proxies do is to accept messages from the Euler contract that instruct them to issue log messages. For example, if an EToken proxy's `transfer` method is invoked, a `Transfer` event must be logged from the EToken proxy's address, not the main Euler address.

One important feature provided by the proxy/module system is that a single storage context (ie the main Euler contract) can have multiple possibly-colliding function ABI namespaces, which is not possible with systems like a conventional upgradeable proxy, or the Diamond standard. For example, Euler provides multiple ERC-20 interfaces but there is no worry that the `balanceOf()` methods of the ETokens and DTokens (which necessarily have the same selector) will collide.

For more details on the proxy protocol see `docs/proxy-protocol.md`.



### Dispatching

Other than the proxies, `contracts/Euler.sol` is the only other code that cannot be upgraded. It is the implementation of the main Euler contract. Essentially its only job is to be a placeholder address for the Euler storage, and to `delegatecall()` to the appropriate modules.

When it invokes a module, `contracts/Euler.sol:dispatch()` appends some extra data onto the end of the `msg.data` it receives from the proxy:

* Its own view of `msg.sender`, which corresponds to the address of the proxy.
* The `msgSender` passed in from the (trusted) proxy, which corresponds to the original `msg.sender` that invoked the proxy.

The reason it appends onto the end of the data is so that this extra information does not interfere with the ABI decoding that is done by the module: Solidity's ABI decoder is tolerant of extra trailing data and will ignore it. This allows us to use the module interfaces output from `solc` directly when communicating with the proxies, while still allowing the functions to extract the proxy addresses and original `msg.sender`s as seen by the proxies.

Since the modules are invoked by `delegatecall()`, the proxy address is typically available to module code as `msg.sender`, so why is it necessary to pass this in to the modules? It's because batch requests allow users to invoke methods without going through the proxies (see below).



## Modules

### Installer

The first module used is the installer module. This module is used to bootstrap install the rest of the modules, and can later on be used to upgrade modules to add new features and/or fix bugs.

Currently the functions are gated so that the `upgradeAdmin` address is the only address that can upgrade modules. However, the installer module itself is also upgradeable, so this logic can be restricted as we move towards greater levels of decentralisation.

### EToken

Every market has an EToken. This is the primary interface for the tokenisation of **assets** in the Euler protocol:

* **deposit**: Transfer tokens from your wallet into Euler, and receive interest earning tokens in return.
* **withdraw**: Redeem your ETokens for the underlying tokens, which are transfered from Euler to your wallet, along with any interest accrued.

Additionally, ETokens provide an ERC-20 compliant interface which allows you to transfer and approve transfers of your ETokens, as is typical.

Like Compound, but unlike AAVE, these tokens have static balances. That is, accrued interest will not cause the value returned from `balanceOf` to increase. Rather, that fixed balance entitles you to reclaim more and more of the underlying asset as time progresses. Although the AAVE model is conceptually nicer, experience has shown that increasing balance tokens causes a lot of pain to integrators. In particular, if you transfer X ETokens into a pool contract and later withdraw that same X, you have not earned any interest and the pool has some left over dust ETokens that typically aren't allocated to anyone.

A downside of the Compound model is that the values returned from `balanceOf` are in internal bookkeeping units and don't really have any meaning to external users. There is of course a `balanceOfUnderlying` method (named the same as Compound's method, which may become a defacto standard) that returns the amount in terms of the underlying and *does* increase block to block.

### DToken

Every market also has a DToken. This is the primary interface for the tokenisation of **debts** in the Euler protocol:

* **borrow**: If you have sufficient collateral, Euler sends you the underlying tokens and issues you a corresponding amount of debt tokens.
* **repay**: Transfer tokens from your wallet in order to burn the DTokens, which reduces your debt obligation.

DTokens also implement an ERC-20 compliant interface. Unlike AAVE, where these are non-transferrable, DTokens *can* be transferred. The permissioning logic is the opposite of ETokens: While you can send your ETokens to anyone without their permission, with DTokens you can "take" anybody else's DTokens without their permission (assuming you have sufficient collateral). Similarly, just as you can approve another address to take some amount of your ETokens, you can approve another account permission to send you an amount of DTokens.

As well as providing a flexible platform for debt trading and assignment, this system also permits easy transferring of debt positions between sub-accounts (see below).

Unlike ETokens, DToken balances *do* increase block-to-block as interest is accrued. This means that in order to pay off a loan in full, you should specify MAX_UINT256 as the amount to pay off, so that all interest accrued at the point the repay transaction is mined gets repaid. Note that most Euler methods accept this MAX_UINT256 value to indicate that the contract should determine the maximum amount you can deposit/withdraw/borrow/repay at the time the transaction is mined.

In the code you will also see `INTERNAL_DEBT_PRECISION`. This is because DTokens are tracked at a greater precision versus ETokens (27 decimals versus 18) so that interest compounding is more accurate. However, to present a common external decimals amount, this internal precision is hidden from external users of the contract. Note that these decimal place amounts remain the same even if the underlying token uses fewer decimal places than 18 (see the Decimals Normalisation section below).

### Markets

This module allows you to activate new markets on the Euler protocol. Any token can be activated, as long as there exists a Uniswap 3 pair between it and the reference asset (WETH version 9 in the standard deployment).

It also allows you to enter/exit markets, which controls which of your ETokens are used as collateral for your debts. This terminology was chosen deliberately to match Compound's, since many of our users will be familiar with Compound already.

Unlike Compound which keeps both an array and a mapping for each user, we only keep an array. Upon analysis we realised that almost every access to the mapping will be done inside a transaction that *also* scans through the array (usually as a liquidity check) so the mapping was (nearly) redundant and we thus could eliminate an SSTORE when entering a market. Furthermore, instead of a normal length-prefixed storage array, we store the length in a packed slot that is loaded for other reasons. This saves an additional SSTORE since we don't need to update the array length, and saves and SLOAD on every liquidity check (more important post Berlin fork). Taking it one step further, there is also an optimisation where the first entered market address is stored in a special variable that is packed together with this length.

Finally, the markets module allows external users to query for market configuration parameters (ie collateral factors) and current states (ie interest rates).

### RiskManager

This is an internal module, meaning it is only called by other modules, and does not have a proxy entry point.

RiskManager is called when a market is activated, to get the default risk parameters for a newly created market. Also, it is called after every operation that could affect a user's liquidity (withdrawal, borrow, transferring E/DTokens, exiting a market, etc) to ensure that no liquidity violations have occurred. This logic could be implemented in BaseLogic, and would be slightly more efficient if so, but then upgrading the risk parameters would require upgrading nearly every other module.

In order to check liquidity, this module must retrieve prices of assets (see the Pricing section below).

### Governance

This module lets a particular privileged address update market configuration parameters, such as the TWAP intervals, borrow and collateral factors, and interest rate models.

Eventually this logic will be enhanced to support EUL-token driven governance.

### Liquidation

This module implements the liquidations system.

### Exec

This module implements some of the more advanced ways of invoking the Euler contract (described futher below):

* Batch requests
* Deferred liquidity checks

It also has an entry point for querying detailed information about an account's liquidity status.


## Storage and Inheritance

Most of the modules inherit from `BaseLogic` which provides common lending logic related functionality. This contract inherits from `BaseModule`, which inherits from `Base`, which inherits from `Storage`.

Almost all the functions in the Base modules are declared as private or internal. This is necessary so that modules don't export unexpected functions, and also so that the solidity compiler can optimise away unneeded functions (not all modules use all functions).

`contracts/Storage.sol` contains the storage layout that is used by all modules. It is important that this match, since all modules are called with `delegatecall()` from the Euler contract context. Furthermore, it is important that upgrades preserve the storage ordering and offsets. The test `test/storage.js` has the beginning of an implementation to take the Soldity compiler's storage layout output and verify that it is consistent across upgrades. After we deploy our first version, we will "freeze" the storage layout and encode this in the `test/storage.js` test.



## Pricing

Euler uses Uniswap 3 as its pricing oracle. In order to ensure that prices are not vulnerable to snapshot manipulation, this requires using the time-weighted average price (TWAP) of a recent time period.

When a market is activated, the RiskManager calls `increaseObservationCardinalityNext()` on the uniswap pool to increase the size of the uniswap oracle's ring buffer to a minimum size (by default 10). It will try to retrieve prices averaged over the per-instrument `twapWindow` parameter. If it cannot be serviced because the oldest value in the ring buffer is too recent, it will use the oldest price available (which we have ensured is at least 10 blocks old). In this case, it will pay the gas cost to increase the ring buffer by 1. The intent is to apply this feedback to tokens that have too short a ring-buffer, and dynamically lengthen it until such time as this is no longer the case.

In the event that a price's TWAP period is shorter than `twapWindow`, the RiskManager may apply an extra factor to decrease the token's collateral/borrow factor for the purposes of borrowing/withdrawing (but not for liquidations). This is still TBD.

Our blog series describes our pricing system in more detail: https://medium.com/euler-xyz/prices-and-oracles-2da0126a138



## Liquidity Deferrals

Normally, upon the completion of an operation that could fail due to a collateral violation (ie taking out a loan, withdrawing ETokens, exiting a market), the user's liquidity must be checked. This is done immediately after each operation by calling `contracts/BaseLogic.sol:checkLiquidity()`, which calls the internal RiskManager module's `requireLiquidity()` which will revert the transaction if the account is insufficiently collateralised.

However, this pattern causes some sequences of operations to fail unnecessarily. For example, a user must deposit ETokens and enter the market first, before taking out a loan, even if this is done in the same atomic transaction.

Furthermore, this can result in needless gas consumption. Consider a user taking out two loans in the same transaction: If the liquidity is checked each time, that means two separate liquidity checks are done, each of which requires accessing prices, looping over the entered markets list, and computing the liquidity (net of assets and liabilities, converted to the reference asset, and scaled by corresponding collateral and borrow factors).

Liquidity deferral is a general purpose solution to this. Users (which must be smart contracts, but see Batch Requests below) can call the `deferLiquidityCheck()` function in the Exec module. This function disables all liquidity checking for a specified account, and then re-enters the caller by calling the `onDeferredLiquidityCheck()` function on `msg.sender`. While this callback is executing, `checkLiquidity()` will not bother checking the liquidity for the specified account. After the function returns, the liquidity will then be checked.

As well as gas optimisation, and normal use-cases like refinancing loans, this also allows users to take out [flash loans](https://medium.com/euler-xyz/prices-and-oracles-2da0126a138).

For flash loans in particular, the protocol provides an adaptor contract `FlashLoan`, which complies with the ERC-3156 standard. The adaptor internally uses liquidity deferral to borrow tokens and additionally requires that the loan is paid back in full within the transaction.


## Sub Accounts

In order to prevent a problem inherent with borrowing multiple assets using the same backing collateral, it is sometimes necessary to "isolate" borrows. This is especially important for volatile and/or untrusted tokens that shouldn't have the capability to affect more stable tokens.

Euler implements this borrow isolation to protect lenders. However, this can lead to a suboptimal user experience. In the event a user wants to borrow multiple assets (and one or more are isolated), a separate wallet must be created and funded. Although there is nothing wrong with having many metamask accounts, this can be a bad experience, especially when they are using hardware wallets.

In order to improve on this, Euler supports the concept of sub-accounts. Every ethereum address has 256 sub-accounts on Euler (including the primary account). Each sub-account has a sub-account ID from 0-255, where 0 is the primary account's ID. In order to compute the sub-account addresses, the sub-account ID is treated as a `uint` and XORed (exclusive ORed) with the ethereum address.

Yes, this reduces the security of addresses by 8 bits, but creating multiple addresses in metamask also reduces security: if somebody is trying to brute-force one of your N>1 private keys, they have N times as many chances of succeeding per guess. Although it has to be admitted that the subaccount model is weaker because finding a private key for a subaccount gives access to *all* subaccounts, but there is still a very comfortable security margin.

You only need to approve Euler once per token, and then you can then deposit/repay into any of your sub-accounts. No approvals are necessary to transfer assets or liabilities between sub-accounts. Operations can also be done to mutiple sub-accounts within a single transaction by using batch requests (see below).

The Euler UI will make it convenient to view at a glance the composition of your sub-accounts, and to rebalance collateral as needed to maintain your debt positions.



## Batch Requests

Sometimes it is useful to be able to do multiple operations within a single transaction. This can be useful to reduce gas overhead by amortising the fixed transaction costs, especially if the operations involve multiple writes to the same storage slots (post Istanbul fork) and/or multiple reads from the same storage slots (post Berlin fork). It can also be useful to add atomicity to a sequence of operations (either they all succeed or they all fail).

In Ethereum these benefits are available to smart contracts, but not EOAs (normal private/public keypair accounts). This is unfortunate because many users can't/won't deploy smart contract wallets.

As a partial solution to this, the `contracts/modules/Exec.sol:batchDispatch()` function allows a group of Euler interactions to be executed within a single blockchain transaction. This is a "partial" solution since users cannot execute arbitrary logic in between the interactions, but is nonetheless sufficient for a wide variety of use-cases.

For example, in order to provide collateral to Euler, two separate steps must occur: Depositing into the EToken, and entering the market for that EToken. Rather than requiring users to make two separate transactions, or implementing a hypothetical `depositAndEnter()` function (which would imply a combinatorial explosion of method combinations), batch transactions can be employed.

Additionally, liquidity checks can be deferred on one or more accounts in a batch transaction. This can provide significant gas cost savings and can allow flash-loan-like rebalancing without the need for a smart contract. We are planning on implementing a built-in swap functionality that will convert one EToken to another by performing a swap on Uniswap. This would be very gas-efficient since tokens do not need to be moved from external wallets to and from Euler's wallet, and would also allow an easy way to create leveraged positions, even for EOA users.



## Reserves

Similar to Compound and AAVE, a proportion of the interest earned in a pool is collected by the protocol as a fee. Euler again uses the same terminology as Compound, calling the aggregate amount of collected fees the "reserve". These fees are controlled by governance, and may be paid out to EUL token holders, used to compensate lenders should pools become insolvent, or applied to other uses that benefit the protocol.

Unlike Compound where the reserves are denominated in the underlying, Euler's reserves are stored in the internal bookkeeping units that represent EToken balances. This means that they accrue interest over time, as with any other EToken deposit. Of course, Compound governance could periodically choose to withdraw their reserves and re-deposit them in the pool to earn this interest, but in Euler it happens automatically and continuously. Similar to Euler, AAVE deposits earned reserve interest into a special treasury account that owns the aTokens, however this is much less efficient than the special-cased reserves model of Compound/Euler, involving several cross-contract calls. In Euler, the reserves overhead is primarily two SSTORE operations, to slots that would be written to anyway.

When we issue "eTokens" to the reserve, it inflates the eToken supply (making them less valuable). However, we only do this after we increase totalBorrows, ensuring that the inflation is less than what was earned as interest, proportional to the reserve fee configured for that asset.



## Interest rate models

FIXME: describe

### Reactive Models

### PID Controllers




## Liquidations

FIXME: describe

### Front-running protection





## Misc Details

### Decimals

The ERC-20 specification allows contracts to choose the number of decimal places that a token supports. This is now widely regarded as problematic, since it causes a lot of annoying integration work (see ERC-777 for an interesting alternative).

Rather than exposing this to our system, we have decided to normalise the decimals up to 18 for all tokens (Euler for now does not support tokens with > 18 decimals). As well as simplifying our contract and off-chain logic, this allows more precise interest accrual.

### Rounding

Debts are always rounded *up* to the smallest possible external unit (1 "wei" on 18 decimal tokens). This means that after any interest at all is accrued (ie, after 1 second), borrowers already owe at least 1 unit. When you repay, this extra fraction is added to the EToken pool. This works because debt amounts are tracked at a higher precision (27 decimals) than the external units (0-18 decimals).

### Compounding behaviour

Unlike Compound, where the compounding occurs whenever a user interacts with a token, Euler compounds deterministically every second. The amounts owed/earned are independent of how often the contract is interacted with, except of course for interactions that result in interest rate changes. As mentioned, the compounding precision is done to 27 decimal places, according to the current interest rate in effect (determined by the interest rate model).

In the Compound system, interest accumulators are opportunistically updated for all operations that affect assets, which is necessary because this is how compounding is achieved (simple interest being charged between updates). Because Euler precisely tracks the per-second compounded balance, there is no advantage to updating the accumulator frequently, and therefore Euler does it lazily only when it actually needs to (before operations that affect debt obligation balances). So as well as being more accurate, this means that fewer storage writes are needed.

### External access to interest accumulators

There is a method in the markets module, `interestAccumulator()` that retrieves the current interest accumulator for an asset. Because the accumulators are updated lazily as described above, rather than just returning the stored value, this method computes the updated accumulator given the most recent block's timestamp (sometimes called a "counterfactual" value).

Although the returned values are in opaque internal units, they can be used to determine the accumulated interest over time by comparing snapshots. This is sort of like using Uniswap-style "TWAPs": By dividing a recent snapshot by an older snapshot, the actual amount of interest collected between those two time periods is computed.

### Unusual/Malicious tokens

We try to work as well as possible with "deflationary" tokens. These are tokens where when you request a transfer for X, fewer than X tokens are actually transferred. For these, we check the Euler contract's balance in the token before and after to determine how much was transferred.

Relatedly, on some tokens the `balanceOf` method can return different results with no intervening operations. In this case, the total pool available to owners of ETokens of these underlyings will be affected, but the protocol itself will not be (assuming such tokens have collateral factors of 0, which is the default).

Since we allow arbitrary tokens to be activated, our threat model is larger than that of Compound/AAVE. We need to worry about misbehaving tokens, even one-off tokens written specifically to attempt theft from the protocol. See the file `docs/attacks.md` for some more notes on the threat modelling.

Tokens may return extremely large values in an attempt to cause math overflows. This could be disastrous, especially if a user could cause their own liquidity checks to fail. In this case, a user could create an un-liquidateable position. To prevent this, when we receive a very large result from `balanceOf`, we treat that result as though it were 0 (which a malicious token could also do of course). This way liquidity checks will at least succeed, allowing non-malicious collaterals to be liquidated.
