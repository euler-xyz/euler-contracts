// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";

/*

SwapHub is a generic swapping interface where users can select their desired swapping handler
without any changes needed to Euler contracts.

When a user invokes a swap, the input amount (or maximum input) is transferred to the handler
contract. The handler contract should then perform the swap by whatever means it chooses,
then transfer back any remaining input and all the output. SwapHub will ensure that the
amounts returned satisfy the user's slippage settings and process the corresponding
withdrawal and deposit on behalf of the user.

*/

contract SwapHub is BaseLogic {
    struct SwapParams {
        address underlyingIn;
        address underlyingOut;
        uint mode; // 0=exactIn  1=exactOut
        uint amountIn;  // mode 0: exact,    mode 1: maximum
        uint amountOut; // mode 0: minimum,  mode 1: exact
        bytes payload;
    }

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

    function swap(uint subAccountIdIn, uint subAccountIdOut, address swapHandler, SwapParams memory params) external nonReentrant {
        swapInternal(subAccountIdIn, subAccountIdOut, swapHandler, params);
    }

    function swapAndRepay(uint subAccountIdIn, uint subAccountIdOut, address swapHandler, SwapParams memory params) external nonReentrant {
        // FIXME: get debt amounts, alter params accordingly

        swapInternal(subAccountIdIn, subAccountIdOut, swapHandler, params);

        // FIXME: pay back debt
    }

    function swapInternal(uint subAccountIdIn, uint subAccountIdOut, address swapHandler, SwapParams memory params) private {
        require(params.underlyingIn != params.underlyingOut, "e/swap/same");


        // Init SwapCache

        SwapCache memory swap;

        address msgSender = unpackTrailingParamMsgSender();
        swap.accountIn = getSubAccount(msgSender, subAccountIdIn);
        swap.accountOut = getSubAccount(msgSender, subAccountIdOut);

        updateAverageLiquidity(swap.accountIn);
        if (swap.accountIn != swap.accountOut) updateAverageLiquidity(swap.accountOut);

        //emit RequestSwapHub();

        swap.eTokenIn = underlyingLookup[underlyingIn].eTokenAddress;
        swap.eTokenOut = underlyingLookup[underlyingOut].eTokenAddress;

        require(swap.eTokenIn != address(0), "e/swap/in-market-not-activated");
        require(swap.eTokenOut != address(0), "e/swap/out-market-not-activated");

        AssetStorage storage assetStorageIn = eTokenLookup[swap.eTokenIn];
        AssetStorage storage assetStorageOut = eTokenLookup[swap.eTokenOut];

        swap.assetCacheIn = loadAssetCache(underlyingIn, assetStorageIn);
        swap.assetCacheOut = loadAssetCache(underlyingOut, assetStorageOut);

        swap.preBalanceIn = callBalanceOf(swap.assetCacheIn, address(this)) ;
        swap.preBalanceOut = callBalanceOf(swap.assetCacheOut, address(this));


        // Send Handler Funds

        require(swap.assetCacheIn.poolSize >= params.amountIn, "e/swap/insufficient-pool-size");
        // FIXME: use withdrawAmounts
        Utils.safeTransfer(token, swapHandler, params.amountIn);


        // Invoke Handler

        ISwapHandler(swapHandler).executeSwap(params);


        // Verify output received, credit any returned input

        {
            uint postBalanceIn = callBalanceOf(swap.assetCacheIn, address(this));
            uint postBalanceOut = callBalanceOf(swap.assetCacheOut, address(this));

            require(postBalanceOut >= swap.preBalanceOut + params.amountOut, "e/swap/insufficient-output");
        }

        // FIXME: processWithdraw

        // FIXME: processDeposit

        checkLiquidity(swap.accountIn);
    }
}
