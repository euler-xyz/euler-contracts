
methods {
    computeNewAverageLiquidity(address,uint) => NONDET
    callInternalModule(uint,bytes memory)    => NONDET
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


