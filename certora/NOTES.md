10/4
====

- only functions called by mint and burn and not deposit/withdraw (which aren't
  timing out) are increaseBorrow and decreaseBorrow

- they have logBorrowChange and updateUserBorrow in common
   (also with transferBorrow)
   - logBorrowChange can (should?) be removed
   - updateUserBorrow

9/10 discussion; overview
=========================

Certora team looked over Euler code and discussed challenges it may raise for
CVT and how to address them.

Architecture: Modules, proxies, and delegation
----------------------------------------------

Our understanding is that all contracts (except Proxies) execute in the context
of the same Euler contract, defined in Euler.sol, and that all the state of that
contract is defined in Storage.sol.

This design should not have a large impact on verification.  Invariants and
parametric rules are already checked separately on each method; using a modular
specification file that is checked on each contract independently will have
the same effect as if all contracts are checked together; no special linking or
configuration should be required for this situation.

The main difficulty will occur if the modules are invoking functions defined in
other modules (especially functions with side effects).  In this case, the tool
may not be aware that the storage of both modules is actually the same.  There
are a number of workarounds that we can try if this is causing trouble:

 - We may be able to provide method summaries that summarize the key properties
   of the external methods, and then separately verify that those methods have
   those properties

 - If that doesn't work, we can probably add support in the tool for stating
   that another contract executes in the same context as the current contract.
   CVT will then be able to inline those methods as if they were in the same
   contract.

In either case, it probably makes sense to separately verify the properties
of the dispatching system; we can think about the key properties that the
module system should maintain.

Storage access patterns
-----------------------

Another area of potential difficulty is the way that the modules access the
storage through the AssetCache.  This is an unusual pattern, and it may cause
difficulty for the tool.  We think that with some small changes, we should be
able to handle the difficulties.

The main concern is structure of the `BaseLogic.initAssetCache` method.  This
method does two things: first, it copies data from the AssetStorage into the
AssetCache, and second, it performs ubiquitous operations like accruing interest
and calculating fees.  Because this method is called everywhere, it is important
that we can analyze it efficiently.

The first part of the method may be difficult because it will exercise some of
the newer and less tested code analyses that CVT uses.  If they work properly,
the tool should be able to reason about the cache in the same way it reasons
about regular storage without too much overhead.  We will run some tests on
Monday that will make sure that it's operating properly on Euler's codebase,
and have our tool developers look at any issues that shake out.

The second part of the `initAssetCache` method (accruing interest and performing
other calculations) will also cause difficulty for the tool.  CVT tends to run
slowly and has difficulty analyzing code with lots of multiplications,
divisions, and exponentiations; since this method is invoked in lots of places,
the tool will need to reanalyze the difficult code many times; we'll probably
end up with timeouts everywhere.

To address this problem, we recommend factoring out the computations in
`initAssetCache` into a separate method or methods that are called from
`initAssetCache`.  We can then replace this method with a summary for the
majority of the verification, and verify any necessary properties of the code
separately.  This should make verification much easier (and is probably nicer
from a software engineering standpoint too).

Next steps
----------

- We will take a look at the harness setup and run sanity tests to make sure
  that we can verify trivial rules without timing out.

- We will start setting up the modular rules and linking structure described
  above

- We will take a look at the modules to see if there is a lot of problematic
  cross-contract method calls and determine if we need to start adding support
  for multi-contract single-storage as described above

- We will refactor the `initAssetCache` method as discussed above.

- We will also check that the storage analyses are working properly on the
  Euler codebase.



