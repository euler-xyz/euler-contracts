// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../vendor/ISwapRouter.sol";

contract Swap is BaseLogic {

    address immutable uniswapRouter;

    struct SwapUniExactInputSingleParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountIn;
        uint amountOutMinimum;
        uint deadline;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    struct SwapUniExactInputParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountIn;
        uint amountOutMinimum;
        uint deadline;
        bytes path;
    }

    struct SwapUniExactOutputSingleParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountOut;
        uint amountInMaximum;
        uint deadline;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    struct SwapUniExactOutputParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountOut;
        uint amountInMaximum;
        uint deadline;
        bytes path;
    }

    struct SwapCache {
        address accountIn;
        address accountOut;
        address eTokenIn;
        address eTokenOut;
        AssetCache assetCacheIn;
        AssetCache assetCacheOut;
        uint balanceIn;
        uint balanceOut;
        uint amountIn;
        uint amountOut;
    }

    constructor(address _uniswapRouter) BaseLogic(MODULEID__SWAP) {
        uniswapRouter = _uniswapRouter;
    }

    function swapUniExactInputSingle(SwapUniExactInputSingleParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amountIn,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_INPUT_SINGLE
        );

        uint amountInternalIn;
        (swap.amountIn, amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, params.amountIn);
        swap.amountIn /= swap.assetCacheIn.underlyingDecimalsScaler;

        IERC20(params.underlyingIn).approve(uniswapRouter, swap.amountIn);

        swap.amountOut = ISwapRouter(uniswapRouter).exactInputSingle(
            ISwapRouter.ExactInputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: params.fee,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountIn: swap.amountIn,
                amountOutMinimum: params.amountOutMinimum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );

        finalizeSwap(swap, amountInternalIn);
    }

    function swapUniExactInput(SwapUniExactInputParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amountIn,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_INPUT
        );

        uint amountInternalIn;
        (swap.amountIn, amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, params.amountIn);
        swap.amountIn /= swap.assetCacheIn.underlyingDecimalsScaler;

        IERC20(params.underlyingIn).approve(uniswapRouter, swap.amountIn);
  
        swap.amountOut = ISwapRouter(uniswapRouter).exactInput(
            ISwapRouter.ExactInputParams({
                path: params.path,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountIn: swap.amountIn,
                amountOutMinimum: params.amountOutMinimum
            })
        );

        finalizeSwap(swap, amountInternalIn);
    }

    function swapUniExactOutputSingle(SwapUniExactOutputSingleParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amountOut,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT_SINGLE
        );

        swap.amountOut = params.amountOut;
        IERC20(params.underlyingIn).approve(uniswapRouter, params.amountInMaximum);

        swap.amountIn = ISwapRouter(uniswapRouter).exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: params.fee,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountOut: params.amountOut,
                amountInMaximum: params.amountInMaximum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );

        uint amountInternalIn;
        (swap.amountIn, amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, swap.amountIn);
        swap.amountIn /= swap.assetCacheIn.underlyingDecimalsScaler;

        finalizeSwap(swap, amountInternalIn);

        if(swap.amountIn < params.amountInMaximum) {
            IERC20(params.underlyingIn).approve(uniswapRouter, 0);
        }
    }

    function swapUniExactOutput(SwapUniExactOutputParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amountOut,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT
        );

        swap.amountOut = params.amountOut;
        IERC20(params.underlyingIn).approve(uniswapRouter, params.amountInMaximum);

        swap.amountIn = ISwapRouter(uniswapRouter).exactOutput(
            ISwapRouter.ExactOutputParams({
                path: params.path,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountOut: params.amountOut,
                amountInMaximum: params.amountInMaximum
            })
        );

        uint amountInternalIn;
        (swap.amountIn, amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, swap.amountIn);
        swap.amountIn /= swap.assetCacheIn.underlyingDecimalsScaler;

        finalizeSwap(swap, amountInternalIn);

        if(swap.amountIn < params.amountInMaximum) {
            IERC20(params.underlyingIn).approve(uniswapRouter, 0);
        }
    }

    function initSwap(
        address underlyingIn,
        address underlyingOut,
        uint amount,
        uint subAccountIdIn,
        uint subAccountIdOut,
        uint swapType
    ) private returns (SwapCache memory swap) {
        require(underlyingIn != underlyingOut, "e/swap/same");

        address msgSender = unpackTrailingParamMsgSender();
        swap.accountIn = getSubAccount(msgSender, subAccountIdIn);
        swap.accountOut = getSubAccount(msgSender, subAccountIdOut);

        updateAverageLiquidity(swap.accountIn);
        updateAverageLiquidity(swap.accountOut);

        emit RequestSwap(
            swap.accountIn,
            swap.accountOut,
            underlyingIn,
            underlyingOut,
            amount,
            swapType
        );

        swap.eTokenIn = underlyingLookup[underlyingIn].eTokenAddress;
        swap.eTokenOut = underlyingLookup[underlyingOut].eTokenAddress;

        AssetStorage storage assetStorageIn = eTokenLookup[swap.eTokenIn];
        AssetStorage storage assetStorageOut = eTokenLookup[swap.eTokenOut];

        require(assetStorageIn.underlying != address(0), "e/swap/in-market-not-activated");
        require(assetStorageOut.underlying != address(0), "e/swap/out-market-not-activated");

        swap.assetCacheIn = loadAssetCache(underlyingIn, assetStorageIn);
        swap.assetCacheOut = loadAssetCache(underlyingOut, assetStorageOut);

        swap.balanceIn = callBalanceOf(swap.assetCacheIn, address(this)) ;
        swap.balanceOut = callBalanceOf(swap.assetCacheOut, address(this));
    }

    function finalizeSwap(SwapCache memory swap, uint amountInternalIn) private {
        require(callBalanceOf(swap.assetCacheIn, address(this)) == swap.balanceIn - swap.amountIn, "e/swap/balance-in");
        require(callBalanceOf(swap.assetCacheOut, address(this)) == swap.balanceOut + swap.amountOut, "e/swap/balance-out");

        processWithdraw(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.eTokenIn, swap.accountIn, amountInternalIn);

        processDeposit(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.eTokenOut, swap.accountOut, swap.amountOut);

        // only checking outgoing account, deposit can't lower health score
        checkLiquidity(swap.accountIn);
    }

    function processDeposit(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amount) internal {
        uint amountInternal;

        amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
        assetCache.poolSize += amount;

        increaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        logAssetStatus(assetCache);
    }

    function processWithdraw(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amountInternal) internal {
        assetCache.poolSize = decodeExternalAmount(assetCache, callBalanceOf(assetCache, address(this)));

        decreaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        logAssetStatus(assetCache);
    }
}