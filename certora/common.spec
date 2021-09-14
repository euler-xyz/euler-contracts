
methods {
    computeNewAverageLiquidity(address,uint) => NONDET
//    callInternalModule(uint,bytes memory)    => NONDET // not supposed to work, why no error?
    computeUtilisation(uint,uint)            => NONDET
    _computeExchangeRate(uint,uint,uint)     => NONDET
}


rule sanity(method f)
filtered {
    f -> f.selector == deposit(uint,uint).selector
}
{ 
    env e; calldataarg args;

    f(e,args);

    assert false,
        "this should fail";
}

