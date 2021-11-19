// this is for functions specific to the DToken contract
import "./common.spec"

methods {

}

// 1.1 (![TODO]) `[borrow_increasing]`: borrowing only increases DToken balance
// 1.2 (![TODO]) `[borrow_contained]`: borowing has no affect on other assets
// 1.3 (![TODO]) `[borrow_accurate]` : correct amount is always added to the balance
// 1.4 (![TODO]) `[borrow_sum_accurate]`: The totall supply of tokens is increased by the amount borrowed
//     ^ this shoud follow from borrow contained, but is good to check
rule borrow_checks() {
    
    assert false, "TODO";
}


// 2.1 (![TODO]) `[repay_decreasing]`: repaying only decreases DToken balance
// 2.2 (![TODO]) `[repay_contained]`: repayingdoes not affect other assets
// 2.3 (![TODO]) `[repay_accurate]`: correct amount is always subtracted from the balance 
// 2.4 (![TODO]) `[repay_sum_accurate]`: The totall supply of tokens is decreased by the amount repayed
rule repay_checks() {

    assert false, "TODO";
}



// // if a user borrows money, they must always repay greater than they borrowed (to close)
rule borrowing_profitability() { // TODO

    assert false, "TODO";
}