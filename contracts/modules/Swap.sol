// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../vendor/ISwapRouter.sol";

contract Swap is BaseLogic {
    address immutable public uniswapRouter;
    address immutable public oneInch;

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
        uint amountIn;
        uint amountOutMinimum;
        uint deadline;
        bytes path; // list of pools to hop - constructed with uni SDK 
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
        bool exactOwedOut;
    }

    struct SwapUniExactOutputParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        uint amountOut;
        uint amountInMaximum;
        uint deadline;
        bytes path;
        bool exactOwedOut;
    }

    struct Swap1InchParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amount;
        uint amountOutMinimum;
        bytes payload;
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
        uint amountInternalIn;
    }

    constructor(bytes32 moduleGitCommit_, address _uniswapRouter, address _oneInch) BaseLogic(MODULEID__SWAP, moduleGitCommit_) {
        uniswapRouter = _uniswapRouter;
        oneInch = _oneInch;
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

        setWithdrawAmounts(swap, params.amountIn);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, swap.amountIn);

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

        finalizeSwap(swap);
    }

    function swapUniExactInput(SwapUniExactInputParams memory params) external nonReentrant {
        (address underlyingIn, address underlyingOut) = decodeUniPath(params.path, false);

        SwapCache memory swap = initSwap(
            underlyingIn,
            underlyingOut,
            params.amountIn,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_INPUT
        );

        setWithdrawAmounts(swap, params.amountIn);

        Utils.safeApprove(underlyingIn, uniswapRouter, swap.amountIn);

        swap.amountOut = ISwapRouter(uniswapRouter).exactInput(
            ISwapRouter.ExactInputParams({
                path: params.path,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountIn: swap.amountIn,
                amountOutMinimum: params.amountOutMinimum
            })
        );

        finalizeSwap(swap);
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

        swap.amountOut = params.exactOwedOut
            ? getCurrentOwed(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.accountOut) / swap.assetCacheOut.underlyingDecimalsScaler
            : params.amountOut;

        Utils.safeApprove(params.underlyingIn, uniswapRouter, params.amountInMaximum);

        uint pulledAmountIn = ISwapRouter(uniswapRouter).exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: params.fee,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountOut: swap.amountOut,
                amountInMaximum: params.amountInMaximum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );
        require(pulledAmountIn != type(uint).max, "e/swap/exact-out-amount-in");

        setWithdrawAmounts(swap, pulledAmountIn);

        finalizeSwap(swap);

        if (swap.amountIn < params.amountInMaximum) {
            Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        }
    }

    function swapUniExactOutput(SwapUniExactOutputParams memory params) external nonReentrant {
        (address underlyingIn, address underlyingOut) = decodeUniPath(params.path, true);

        SwapCache memory swap = initSwap(
            underlyingIn,
            underlyingOut,
            params.amountOut,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT
        );

        swap.amountOut = params.exactOwedOut
            ? getCurrentOwed(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.accountOut) / swap.assetCacheOut.underlyingDecimalsScaler
            : params.amountOut;

        Utils.safeApprove(underlyingIn, uniswapRouter, params.amountInMaximum);

        uint pulledAmountIn = ISwapRouter(uniswapRouter).exactOutput(
            ISwapRouter.ExactOutputParams({
                path: params.path,
                recipient: address(this),
                deadline: params.deadline > 0 ? params.deadline : block.timestamp,
                amountOut: swap.amountOut,
                amountInMaximum: params.amountInMaximum
            })
        );
        require(pulledAmountIn != type(uint).max, "e/swap/exact-out-amount-in");

        setWithdrawAmounts(swap, pulledAmountIn);

        finalizeSwap(swap);

        if (swap.amountIn < params.amountInMaximum) {
            Utils.safeApprove(underlyingIn, uniswapRouter, 0);
        }
    }

    function swap1Inch(Swap1InchParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amount,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__1INCH
        );

        setWithdrawAmounts(swap, params.amount);

        Utils.safeApprove(params.underlyingIn, oneInch, swap.amountIn);

        (bool success, bytes memory result) = oneInch.call(params.payload);
        if (!success) revertBytes(result);

        swap.amountOut = abi.decode(result, (uint));
        require(swap.amountOut >= params.amountOutMinimum, "e/swap/min-amount-out");

        finalizeSwap(swap);
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
        if (swap.accountIn != swap.accountOut)
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

        require(swap.eTokenIn != address(0), "e/swap/in-market-not-activated");
        require(swap.eTokenOut != address(0), "e/swap/out-market-not-activated");

        swap.assetCacheIn = loadAssetCache(underlyingIn, assetStorageIn);
        swap.assetCacheOut = loadAssetCache(underlyingOut, assetStorageOut);

        swap.balanceIn = callBalanceOf(swap.assetCacheIn, address(this)) ;
        swap.balanceOut = callBalanceOf(swap.assetCacheOut, address(this));
    }

    function setWithdrawAmounts(SwapCache memory swap, uint amount) private view {
        (amount, swap.amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, amount);
        require(swap.assetCacheIn.poolSize >= amount, "e/swap/insufficient-pool-size");

        swap.amountIn = amount / swap.assetCacheIn.underlyingDecimalsScaler;
    }

    function finalizeSwap(SwapCache memory swap) private {
        uint balanceIn = callBalanceOf(swap.assetCacheIn, address(this));

        require(balanceIn == swap.balanceIn - swap.amountIn, "e/swap/balance-in");
        require(callBalanceOf(swap.assetCacheOut, address(this)) == swap.balanceOut + swap.amountOut, "e/swap/balance-out");

        processWithdraw(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.eTokenIn, swap.accountIn, swap.amountInternalIn, balanceIn);

        processDeposit(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.eTokenOut, swap.accountOut, swap.amountOut);

        // only checking outgoing account, deposit can't lower health score
        checkLiquidity(swap.accountIn);
    }

    function processWithdraw(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amountInternal, uint balanceIn) private {
        assetCache.poolSize = decodeExternalAmount(assetCache, balanceIn);

        decreaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        logAssetStatus(assetCache);
    }

    function processDeposit(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amount) private {
        uint amountInternal;

        amountInternal = underlyingAmountToBalance(assetCache, amount);
        assetCache.poolSize += amount;

        increaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        logAssetStatus(assetCache);
    }

    function decodeUniPath(bytes memory path, bool isExactOutput) private pure returns (address, address) {
        require(path.length >= 20 + 3 + 20, "e/swap/uni-path-length");
        require((path.length - 20) % 23 == 0, "e/swap/uni-path-format");

        address token0 = toAddress(path, 0);
        address token1 = toAddress(path, path.length - 20);

        return isExactOutput ? (token1, token0) : (token0, token1);
    }

    function toAddress(bytes memory data, uint start) private pure returns (address result) {
        // assuming data length is already validated
        assembly {
            // borrowed from BytesLib https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol
            result := div(mload(add(add(data, 0x20), start)), 0x1000000000000000000000000)
        }
    }
}
