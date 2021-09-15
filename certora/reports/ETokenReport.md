## Description
    Additional rules to ration about functions specific to the EToken contract

### Bugs Found and Recommendations
### Assumptions Made

### Rules

1. (![TODO]) Deposit:
    1.1 (![TODO]) `[deposit_increasing]`: depositing only increases EToken balance
    1.2 (![TODO]) `[deposit_contained]`: depositing has no affect on other assets
    1.3 (![TODO]) `[deposit_accurate]` : correct amount is always added to the balance
    1.4 (![TODO]) `[deposit_sum_accurate]`: The totall supply of tokens is increased by the amount deposited

2. (![TODO]) Withdraw:
    2.1 (![TODO]) `[withdraw_decreasing]`: withdrawing only decreases EToken balance
    2.2 (![TODO]) `[withdraw_contained]`: withdrawing does not affect other assets
    2.3 (![TODO]) `[withdraw_accurate]`: correct amount is always subtracted from the balance     
    2.4 (![TODO]) `[withdraw_sum_accurate]`: The totall supply of tokens is decreased by the amount withdrawn