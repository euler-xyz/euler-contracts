# Euler Developer Guide

## Modules

The Euler protocol is a collection of smart contracts, connected together with a module system. Each module handles specific areas of the protocol, so depending on what you want to do, you will interact with several different contract addresses.

Some modules are global, for example:

* [markets](#markets): Activating markets, enter/exiting markets, and querying various market-related information.
* [exec](#exec): Batch requests, liquidity deferrals (ie, flash loans)
* [liquidation](#liquidation): Seizure of assets for users in violation

Other modules are asset-specific:

* [eTokens](#eTokens): ERC20-compatible tokens that represent assets
* [dTokens](#dTokens): ERC20-compatible tokens that represent liabilities


## Deposit and withdraw

In order to invest an asset to earn interest, you need to `deposit` into an eToken.

    // Approve the main euler contract to pull your tokens:
    IERC20(underlying).approve(euler, type(uint).max);

    // Get the eToken address using the markets module:
    address eToken = IMarkets(markets).underlyingToEToken(underlying);

    // Deposit 5.25 underlying tokens (assuming 18 decimal places)
    // The "0" argument refers to the sub-account you are depositing to.
    EToken(eToken).deposit(0, 5.25e18);

    EToken(eToken).balanceOf(address(this));
    // -> internal book-keeping value that doesn't increase over time

    EToken(eToken).balanceOfUnderlying(address(this));
    // -> 5.25e18
    // ... but check back next block to see it go up (assuming there are borrowers)

    // Later on, withdraw your initial deposit and all earned interest:
    EToken(eToken).withdraw(0, type(uint).max);


## Borrow and repay

If you would like to borrow an asset, you must have sufficient collateral, and be "entered" into the collateral's market.

    // Approve, get eToken addr, and deposit:
    IERC20(collateral).approve(euler, type(uint).max);
    address collateralEToken = IMarkets(markets).underlyingToEToken(collateral);
    EToken(collateralEToken).deposit(0, 100e18);

    // Enter the collateral market (collateral's address, *not* the eToken address):
    IMarkets(markets).enterMarket(0, collateral);

    // Get the dToken address of the borrowed asset:
    address borrowedDToken = IMarkets(markets).underlyingToDToken(borrowed);

    // Borrow 2 tokens (assuming 18 decimal places).
    // The 2 tokens will be sent to your wallet (ie, address(this)).
    // This automatically enters you into the borrowed market.
    DToken(borrowedDToken).borrow(0, 2e18);

    DToken(borrowedDToken).balanceOf(address(this));
    // -> 2e18
    // ... but check back next block to see it go up

    // Later on, to repay the 2 tokens plus interest:
    IERC20(borrowed).approve(euler, type(uint).max);
    DToken(borrowedDToken).borrow(0, type(uint).max);
