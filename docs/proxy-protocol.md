## Proxy Protocol

Proxies are non-upgradeable stub contracts that have two jobs:

* Forward method calls from external users to the main Euler contract
* Receive method calls from the main Euler contract and log events as instructed

Although proxies themselves are non-upgradeable, they integrate with Euler's module system, which does allow for upgrades.

The following protocols all use custom assembly routines instead of the solidity ABI encoder/decoder. While we don't take this lightly, the measured overhead of keeping this in pure solidity was too high. In order to make up for this otherwise regrettable use of assembly, this document explains the protocols in detail.


### Proxy -> Euler

To the calldata received in a fallback, the proxy prepends the 4-byte selector for `dispatch()` (`0xe9c4a3ac`), and appends its view of `msg.sender`:

    [dispatch() selector (4 bytes)][calldata (N bytes)][msg.sender (20 bytes)]

This data is then passed to the Euler contract with a `CALL` (not `DELEGATECALL`).


### Euler -> module

In the `dispatch()` method, the Euler contract looks up *its* view of `msg.sender`, which corresponds to the proxy address.

The presumed proxy address is then looked up in the `trustedSenders` mapping, which must exist otherwise the call is reverted. It is determined to exist by having a non-zero entry in the `moduleId` field (modules must have non-zero IDs).

The only way a proxy address can be added to `trustedSenders` is if the Euler contract itself creates it (using the `_createProxy` function in `contracts/Base.sol`).

In the case of a single-proxy module, the same storage slot in `trustedSenders` will also contain an address for the module's implementation. If not (ie multi-proxy modules), then the module implementation must be looked up with an additional lookup in the `moduleLookup` mapping. This is because during an upgrade, single-proxy modules just have to update this one spot, whereas multi-proxy modules would otherwise need to update every corresponding entry in `trustedSenders`.

At this point we know the message is originating from a legitimate proxy, so the last 20 bytes can be assumed to correspond to an actual `msg.sender` who invoked a proxy. The length of the calldata is checked. It should be at least `4 + 4 + 20` bytes long, which corresponds to:

* 4 bytes for the `dispatch()` selector.
* 4 bytes for selector used to call the proxy (non-standard ABI invocations and fallback methods are not supported in modules).
* 20 bytes for the trailing `msg.sender`.

The Euler contract then takes the received calldata and strips off the `dispatch()` selector, and then appends *its* view of `msg.sender` (`caller()` in assembly), which corresponds to the proxy's address. This results in the following:

    [original calldata (N bytes)][original msg.sender (20 bytes)][proxy addr (20 bytes)]

This data is then sent to the module implementation with `DELEGATECALL`, so the module implementation code is executing within the storage context of the main Euler contract.

The module implementation will unpack the original calldata using the solidity ABI decoder, ignoring the trailing 40 bytes.

Modules are not allowed to access `msg.sender`. Instead, they should use the `unpackTrailingParamMsgSender()` helper in `contracts/BaseModule.sol` which will retrieve the message sender from the trailing calldata.

When modules need to access the proxy address, there is a composite helper `unpackTrailingParams()` that returns both trailing params. `msg.sender` is still not allowed to be used for this, since modules can be invoked via a batch dispatch, instead of via the proxy.


### module -> Proxy

When a module directly emits a log (or "event" at the solidity level) it will happen from the main Euler contract's address. This is fine for many logs, but not in certain cases like when a module is implementing the ERC-20 standard. In these cases it is necessary to emit the log from the address of the proxy itself.

In order to do this, the Euler contract (specifically one of the modules) does a `CALL` to the proxy address.

When the proxy sees a call to its fallback from the Euler contract (its creator), it knows not to re-enter the Euler contract. Instead, it interprets this call as an instruction to issue a log message. This is the format of the calldata:

    [number of topics as uint8 (1 byte)][topic #i (32 bytes)]{0,4}[extra log data (N bytes)]

The proxy unpacks this message and executes the appropriate log instruction, `log0`, `log1`, etc, depending on the number of topics.
