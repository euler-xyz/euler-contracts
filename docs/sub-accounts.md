## Problem

We don't want to require users to create separate accounts for separate loans.

This is especially because we don't allow multiple assets to be borrowed simultaneously by default, but also to give users control over how their collateral is allocated to each loan.

* Expensive to move funds around
* Pain to manage multiple accounts with metamask
  * Even worse with hardware wallet
* dApp doesn't know accounts are linked


## Solution

Allow an address to control "sub-accounts" that are totally isolated with respect to collateral/borrows

It is desirable that the user's normal address works as a "primary" account, so that integrations don't need to be aware of sub-accounts. For example, transferring ETokens with metamask.

The following methods accept a subAccountId as the first parameter:

* eToken.deposit
* eToken.withdraw
* eToken.approveSubAccount
* dToken.borrow
* dToken.repay
* dToken.approveSubAccount
* markets.enterMarket
* markets.exitMarket


The `transferFrom` methods on eTokens/dTokens can be used to move collateral and debt between sub-accounts


## Sub-account format

There is a limit of 256 sub-accounts per primary account.

In order to compute the sub-account address from the primary, xor the primary with the sub-account ID:

    subAccountAddress = primaryAddress ^ subAccountId

This scheme has the following nice properties:

* When using the sub-account ID of 0, the account address is the same as the primary account.
* Otherwise, the first 19 bytes (38 hex digits) will be the same, but the last byte can differ.
  * This means a simple lexical ordering of accounts in a DB will allow easy selection of all sub-accounts related to a primary.
