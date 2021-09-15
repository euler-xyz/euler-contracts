/*
    This is a specification file for smart contract verification with the Certora prover.
    For more information, visit: https://www.certora.com/

    This file is run with scripts/...
*/

////////////////////////////////////////////////////////////////////////////
//                      Methods                                           //
////////////////////////////////////////////////////////////////////////////

methods {
    proxyLookup()
}
////////////////////////////////////////////////////////////////////////////
//                       Definitions                                      //
////////////////////////////////////////////////////////////////////////////

definition REENTRANCYLOCK__UNLOCKED() returns uint = 1;
definition MAX_EXTERNAL_SINGLE_PROXY_MODULEID() returns uint = 499_999;



////////////////////////////////////////////////////////////////////////////
//                       Invariants                                       //
////////////////////////////////////////////////////////////////////////////
invariant reentrancyLock_valid(): // reentrancyLock should always be open to ensure no reentrancy
    reentrancyLock() == REENTRANCYLOCK__UNLOCKED()

invariant governorAdmin_initialization(): // TODO concept of initialization
    // nitialized => governerAdmin != 0
    false


invariant single_proxy_to_module_bidrectional(): // TODO
    // trustedSenders(proxy).moduleId => proxyLookup(moduleId) == proxy
    false

invariant multi_proxy_proxy_to_module(): // TODO
    false


invariant single_proxy_bounded(uint32 ID): // TODO
    false
    // ID > MAX_EXTERNAL_SINGLE_PROXY_MODULEID() => proxyLookup(ID) == 0 


////////////////////////////////////////////////////////////////////////////
//                       Rules                                            //
////////////////////////////////////////////////////////////////////////////
    
once initialized, governorAdmin should not change
rule governorAdmin_single_definition() { // TODO

    assert false, "not yet implemented";
}

rule moduleLookup_single_definition() { // TODO

    assert false, "not yet implemented";
}