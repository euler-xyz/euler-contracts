# Re-entrancy

Re-entrancy is an emergent property of programming systems that provide interrupts/signals or user-controllable callbacks. It is related to thread-safety but can occur also in single-threaded environments (such as smart contracts). Functions can be thread-safe but not re-entrant, and vice versa.

Contrary to some claims, security vulnerabilities caused by re-entrancy are not unique to smart-contracts and have been exploited in other contexts for decades: https://lcamtuf.coredump.cx/signals.txt

## Compound and its forks

Re-entrancy is a persistent issue in Compound forks because Compound itself is partially vulnerable to re-entrancy attacks. However, Compound is protected because the Compound team has been careful to only activate tokens that do not allow attacker-controllable code to be executed within a transfer operation.

Compound does attempt to take some countermeasures to prevent re-entrancy. For example, each CToken contract has a re-entrancy lock. However, due to the Compound architecture of many inter-communicating contracts, this is not a global lock on the whole system. In particular, during the execution of a function in a CToken, another CToken can be invoked.

Compound's code comments refer to the "checks-effects-interactions" pattern described in the Solidity documentation, however the code itself doesn't rigorously enforce this. For instance, in the CToken borrowFresh() function, `doTransferOut()` (which calls into the token's transfer() method) is invoked before the storage is updated to reflect this borrow. The consequence is that an attacker can initiate a new borrow (on a different CToken) in between the time when they've received the first borrow but before Compound has recorded it, allowing a user to borrow more than their collateral would allow.

At least one fork (Rari Fuse) has implemented a global re-entrancy lock that would prevent a CToken from being invoked during the invocation of another CToken. This is implemented by calling into the Comptroller at the start of any storage-altering method to acquire a lock, and at the end of the method invoking another to release it. This could be effective, although is relatively gas-inefficient. Unfortunately, Rari's implementation of this protection did not protect methods outside of CTokens, in particular `exitMarket()`, which is in the Comptroller itself.

## ETH Transfers

As mentioned above, token contracts that allow attacker-controllable "hooks" are the biggest concern. However, there is another potential re-entrancy vector when handling ETH. Because Compound uses native ETH directly (instead of WETH) it performs low-level ETH transfers. In this case, whenever the recipient is a contract, this contract has the option of executing a receive() function (also known as a fallback).

In order to transfer ETH, Compound uses `address.transfer()`. This Solidity function limits the amount of gas forwarded to the receive function to 2300 gas, which is typically not enough to perform any sort of re-entrancy attack (and that in fact being the purpose of the limit). However, limiting the gas in this fashion has several down-sides. In particular, future upgrades to Ethereum's specification may change gas consumption of certain operations and make 2300 too small (breaking legitimate contracts that log on receipt of ETH) or too large (diminishing the security of the limit). Especially changes to gas refund logic could have security ramifications.

The above down-sides to the `address.transfer()` function have caused the community to recommend that contracts stop using transfer(): https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/

Some Compound forks (such as Rari Fuse) converted these `address.transfer()` calls to low-level calls of the form `address.call.value(amount)("")` which forward an unlimited amount of gas: https://github.com/Rari-Capital/compound-protocol/commit/7acb8df5a5cbf12464b4336663ef7ae6434e62da

Unfortunately, in non-modified Compound code-bases Solidity's gas restriction is the only protection against re-entrancy via ETH transfers, so if that isn't addressed in any other way then this best-practices upgrade opens a security vulnerability.

## Euler

Euler is *not* a Compound fork, but instead an entirely new code-base that contains no Compound code. We were aware of the above described limitation in Compound's re-entrancy locking when we designed the system, which is one of the reasons we developed a light-weight proxy architecture: https://docs.euler.finance/developers/proxy-protocol

In the Euler architecture, each EToken (and DToken, and every other module) is a proxy that `CALL`s (not `DELEGATECALL`s) the primary Euler contract. This allows us to have a single re-entrancy lock that can cover every storage-modifying function in the protocol.

Because we allow users to activate any ERC-20 token on our platform, we assume that any and all tokens may attempt to re-enter our contracts, and rely on the global re-entrancy lock to prevent this. Our build system also verifies that all external state-modifying functions have the re-entrancy guard applied, or have been specially tagged to not require it, for example functions that are simple wrappers around `public` functions that *do* have the re-entrancy guard applied.

We do not support native ETH, instead requiring users to wrap it in WETH before using our system (as with Uniswap3 and many other popular contracts).

In most cases we also try to use the checks-effects-interaction operation ordering, but this is not always possible or ideal. For example, in our DToken's `borrow()` method we perform the token transfer prior to updating the storage, similar to Compound. This is because after performing the transfer we call `balanceOf()` on the token to determine how much was actually transferred, which allows us to more accurately update the interest rate and apply other effects of the borrow in the cases of non-standard deflationary or fee-on-transfer tokens.
