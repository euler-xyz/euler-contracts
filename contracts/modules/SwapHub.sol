// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../swapHandlers/ISwapHandler.sol";

/*

SwapHub is a generic swapping interface where users can select their desired swapping handler
without any changes needed to Euler contracts.

When a user invokes a swap, the input amount (or maximum input) is transferred to the handler
contract. The handler contract should then perform the swap by whatever means it chooses,
then transfer back any remaining input and all the output. SwapHub will ensure that the
amounts returned satisfy the user's slippage settings and process the corresponding
withdrawal and deposit on behalf of the user.

*/

/// @notice Common logic for executing and processing trades through external swap handler contracts
contract SwapHub is BaseLogic {
    struct SwapCache {
        address accountIn;
        address accountOut;
        address eTokenIn;
        address eTokenOut;
        AssetCache assetCacheIn;
        AssetCache assetCacheOut;
        uint preBalanceIn;
        uint preBalanceOut;
    }

    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__SWAPHUB, moduleGitCommit_) {}

    /// @notice Execute a trade using the requested swap handler
    /// @param subAccountIdIn sub-account holding the sold token. 0 for primary, 1-255 for a sub-account
    /// @param subAccountIdOut sub-account to receive the bought token. 0 for primary, 1-255 for a sub-account
    /// @param swapHandler address of a swap handler to use
    /// @param params struct defining the requested trade
    function swap(uint subAccountIdIn, uint subAccountIdOut, address swapHandler, ISwapHandler.SwapParams memory params) external nonReentrant {
        SwapCache memory cache = initSwap(subAccountIdIn, subAccountIdOut, params);

        emit RequestSwapHub(
            cache.accountIn,
            cache.accountOut,
            params.underlyingIn,
            params.underlyingOut,
            params.amountIn,
            params.amountOut,
            params.mode,
            swapHandler
        );

        uint amountOut = swapInternal(cache, swapHandler, params);

        // Process deposit
        uint amountOutDecoded = decodeExternalAmount(cache.assetCacheOut, amountOut);
        uint amountOutInternal = underlyingAmountToBalance(cache.assetCacheOut, amountOutDecoded);
        cache.assetCacheOut.poolSize = decodeExternalAmount(cache.assetCacheOut, cache.preBalanceOut + amountOut);
        AssetStorage storage assetStorageOut = eTokenLookup[cache.eTokenOut];
        increaseBalance(assetStorageOut, cache.assetCacheOut, cache.eTokenOut, cache.accountOut, amountOutInternal);
        logAssetStatus(cache.assetCacheOut);

        // Check liquidity
        checkLiquidity(cache.accountIn);

        // Depositing a token to the account with a pre-existing debt in that token creates a self-collateralized loan
        // which may result in borrow isolation violation if other tokens are also borrowed on the account
        if (cache.accountIn != cache.accountOut && assetStorageOut.users[cache.accountOut].owed != 0)
            checkLiquidity(cache.accountOut);
    }

    /// @notice Repay debt by selling another deposited token
    /// @param subAccountIdIn sub-account holding the sold token. 0 for primary, 1-255 for a sub-account
    /// @param subAccountIdOut sub-account to receive the bought token. 0 for primary, 1-255 for a sub-account
    /// @param swapHandler address of a swap handler to use
    /// @param params struct defining the requested trade
    /// @param targetDebt how much debt should remain after calling the function
    function swapAndRepay(uint subAccountIdIn, uint subAccountIdOut, address swapHandler, ISwapHandler.SwapParams memory params, uint targetDebt) external nonReentrant {
        SwapCache memory cache = initSwap(subAccountIdIn, subAccountIdOut, params);

        emit RequestSwapHubRepay(
            cache.accountIn,
            cache.accountOut,
            params.underlyingIn,
            params.underlyingOut,
            targetDebt,
            swapHandler
        );

        // Adjust params for repay
        require(params.mode == 1, "e/swap-hub/repay-mode");

        AssetStorage storage assetStorageOut = eTokenLookup[cache.eTokenOut];
        uint owed = getCurrentOwed(assetStorageOut, cache.assetCacheOut, cache.accountOut) / cache.assetCacheOut.underlyingDecimalsScaler;
        require (owed > targetDebt, "e/swap-hub/target-debt");
        params.amountOut = owed - targetDebt;

        uint amountOut = swapInternal(cache, swapHandler, params);

        // Process repay
        cache.assetCacheOut.poolSize = decodeExternalAmount(cache.assetCacheOut, cache.preBalanceOut + amountOut);
        decreaseBorrow(assetStorageOut, cache.assetCacheOut, assetStorageOut.dTokenAddress, cache.accountOut, decodeExternalAmount(cache.assetCacheOut, amountOut));
        logAssetStatus(cache.assetCacheOut);

        // Check liquidity only for outgoing account, repay can't lower the health score or cause borrow isolation error
        checkLiquidity(cache.accountIn);
    }

    function swapInternal(SwapCache memory cache, address swapHandler, ISwapHandler.SwapParams memory params) private returns (uint) {
        // Adjust requested amount in
        (uint amountInScaled, uint amountInInternal) = withdrawAmounts(eTokenLookup[cache.eTokenIn], cache.assetCacheIn, cache.accountIn, params.amountIn);
        require(cache.assetCacheIn.poolSize >= amountInScaled, "e/swap-hub/insufficient-pool-size");
        params.amountIn = amountInScaled / cache.assetCacheIn.underlyingDecimalsScaler;

        // Supply handler, for exact output amount transfered serves as an implicit amount in max.
        Utils.safeTransfer(params.underlyingIn, swapHandler, params.amountIn);

        // Invoke handler
        ISwapHandler(swapHandler).executeSwap(params);

        // Verify output received, credit any returned input
        uint postBalanceIn = callBalanceOf(cache.assetCacheIn, address(this));
        uint postBalanceOut = callBalanceOf(cache.assetCacheOut, address(this));

        uint amountOutMin;
        if (params.mode == 0) {
            amountOutMin = params.amountOut;
        } else {
            require(params.amountOut > params.exactOutTolerance, "e/swap-hub/exact-out-tolerance");
            unchecked { amountOutMin = params.amountOut - params.exactOutTolerance; }
        }

        require(postBalanceOut >= cache.preBalanceOut + amountOutMin, "e/swap-hub/insufficient-output");
        require(cache.preBalanceIn >= postBalanceIn, "e/swap-hub/positive-input");

        uint amountIn;
        uint amountOut;
        unchecked {
            amountIn = cache.preBalanceIn - postBalanceIn;
            amountOut = postBalanceOut - cache.preBalanceOut;
        }

        // for exact output calculate amounts in post swap. Also when amount sold is not equal to requested (e.g. partial fill)
        if (params.mode == 1 || amountIn != params.amountIn) {
            amountInScaled = decodeExternalAmount(cache.assetCacheIn, amountIn);
            amountInInternal = underlyingAmountToBalanceRoundUp(cache.assetCacheIn, amountInScaled);
        }

        // Process withdraw
        cache.assetCacheIn.poolSize = decodeExternalAmount(cache.assetCacheIn, postBalanceIn);
        decreaseBalance(eTokenLookup[cache.eTokenIn], cache.assetCacheIn, cache.eTokenIn, cache.accountIn, amountInInternal);
        logAssetStatus(cache.assetCacheIn);

        return amountOut;
    }

    function initSwap(uint subAccountIdIn, uint subAccountIdOut, ISwapHandler.SwapParams memory params) private returns (SwapCache memory cache) {
        require(params.underlyingIn != params.underlyingOut, "e/swap-hub/same");

        address msgSender = unpackTrailingParamMsgSender();
        cache.accountIn = getSubAccount(msgSender, subAccountIdIn);
        cache.accountOut = getSubAccount(msgSender, subAccountIdOut);

        updateAverageLiquidity(cache.accountIn);
        if (cache.accountIn != cache.accountOut) updateAverageLiquidity(cache.accountOut);

        cache.eTokenIn = underlyingLookup[params.underlyingIn].eTokenAddress;
        cache.eTokenOut = underlyingLookup[params.underlyingOut].eTokenAddress;

        require(cache.eTokenIn != address(0), "e/swap-hub/in-market-not-activated");
        require(cache.eTokenOut != address(0), "e/swap-hub/out-market-not-activated");

        AssetStorage storage assetStorageIn = eTokenLookup[cache.eTokenIn];
        AssetStorage storage assetStorageOut = eTokenLookup[cache.eTokenOut];

        cache.assetCacheIn = loadAssetCache(params.underlyingIn, assetStorageIn);
        cache.assetCacheOut = loadAssetCache(params.underlyingOut, assetStorageOut);

        unchecked {
            cache.preBalanceIn = cache.assetCacheIn.poolSize / cache.assetCacheIn.underlyingDecimalsScaler;
            cache.preBalanceOut = cache.assetCacheOut.poolSize / cache.assetCacheOut.underlyingDecimalsScaler;
        }
    }
}
