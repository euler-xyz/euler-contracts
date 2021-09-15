## Description
### Notes
### Bugs Found and Recommendations
### Assumptions Made

### Important State Variables
    reentrancyLock: set to true while and only while a function is executing

    upgradeAdmin:

    governorAdmin:

    moduleLookup:

    proxyLookup:

    trustedSenders: converts an address (of a proxy) to the moduleID and implementation

### Invariants
reentrancyLock_valid: reentrancyLock should always be false to ensure no reentrancy
    reentrancyLock == REENTRANCYLOCK__UNLOCKED

initialized => governerAdmin != 0

modules and proxies should be balanced. Every proxy in proxyLookup corresponds to a module in trusted senders
for single proxy modules
proxy_to_module && module_to_proxy:
    trustedSenders(proxy).moduleId => proxyLookup(moduleId) == proxy

proxy_to_module only for multi-proxy modules

single_proxy_bounded:
    ID > MAX_EXTERNAL_SINGLE_PROXY_MODULEID => proxyLookup(ID) == 0



### State Evolution 

once initialized, governorAdmin should not change

once initialized moduleLookup should not change
    ^ is this True