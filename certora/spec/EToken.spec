// for tests specific to the EToken Contract
import "./common.spec"

methods {
    name() returns (string) 
    symbol() returns (string)
    decimals() returns (uint8)
    totalSupply() returns (uint)
    totalSupplyUnderlying() returns (uint) 
    balanceOf(address ) returns (uint) envfree
    balanceOfUnderlying(address) returns (uint)
    reserveBalance() returns (uint)
    reserveBalanceUnderlying() returns (uint) 
    deposit(uint, uint)
    withdraw(uint, uint)
    mint(uint, uint)
    burn(uint, uint)
    approve(address, uint) returns (bool)
    approveSubAccount(uint, address, uint) returns (bool)
    allowance(address, address) returns (uint)
    transfer(address, uint) returns (bool)
    transferFrom(address, address, uint) returns (bool)
}

// 1.1 (![TODO]) `[deposit_increasing]`: depositing only increases EToken balance
// 1.2 (![TODO]) `[deposit_contained]`: depositing has no affect on other assets
// 1.3 (![TODO]) `[deposit_accurate]` : correct amount is always added to the balance
// 1.4 (![TODO]) `[deposit_sum_accurate]`: The totall supply of tokens is increased by the amount deposited
rule deposit_checks() {

    assert false, "TODO";
}

// 2.1 (![TODO]) `[withdraw_decreasing]`: withdrawing only decreases EToken balance
// 2.2 (![TODO]) `[withdraw_contained]`: withdrawing does not affect other assets
// 2.3 (![TODO]) `[withdraw_accurate]`: correct amount is always subtracted from the balance     
// 2.4 (![TODO]) `[withdraw_sum_accurate]`: The totall supply of tokens is decreased by the amount withdrawn
rule withdraw_checks() {

    assert false, "TODO"
}

// // if a user lends assets and then reclaims their assets, they should always reclaim greater than the amount they lent
rule lending_profitability() {

    assert false, "TODO";
}

rule transactions_contained_transfer() {

    assert false, "TODO";
}

