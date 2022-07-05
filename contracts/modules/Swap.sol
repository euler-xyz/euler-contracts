// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "../vendor/uniswap/ISwapRouter02.sol";
import "../vendor/uniswap/IV3SwapRouter.sol";

/// @notice Trading assets on Uniswap V2, V3 and 1Inch V4 DEXs
contract Swap is BaseLogic {
    address immutable public uniswapRouter;
    address immutable public oneInch;

    /// @notice Params for Uniswap V3 exact input trade on a single pool
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amountIn amount of token to sell
    /// @param amountOutMinimum minimum amount of bought token
    /// @param fee uniswap pool fee to use
    /// @param sqrtPriceLimitX96 maximum acceptable price
    struct SwapUniExactInputSingleParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountIn;
        uint amountOutMinimum;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Params for Uniswap V3 exact input trade routed through multiple pools
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amountIn amount of token to sell
    /// @param amountOutMinimum minimum amount of bought token
    /// @param path list of pools to use for the trade
    struct SwapUniExactInputParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        uint amountIn;
        uint amountOutMinimum;
        bytes path; // list of pools to hop - constructed with uni SDK 
    }

    /// @notice Params for Uniswap V3 exact output trade on a single pool
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amountOut amount of token to buy
    /// @param amountInMaximum maximum amount of sold token
    /// @param fee uniswap pool fee to use
    /// @param sqrtPriceLimitX96 maximum acceptable price
    struct SwapUniExactOutputSingleParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amountOut;
        uint amountInMaximum;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    /// @notice Params for Uniswap V3 exact output trade routed through multiple pools
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amountOut amount of token to buy
    /// @param amountInMaximum maximum amount of sold token
    /// @param path list of pools to use for the trade
    struct SwapUniExactOutputParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        uint amountOut;
        uint amountInMaximum;
        bytes path;
    }

    /// @notice Params for Uniswap and 1Inch trade
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amount amount of token to sell
    /// @param amountOutMinimum minimum amount of bought token
    /// @param payload call data passed to Uniswap or 1Inch contract
    struct SwapExactInputPayloadParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amount;
        uint amountOutMinimum;
        bytes payload;
    }

    /// @notice Params for Uniswap (with use of multicall) trade
    /// @param subAccountIdIn subaccount id to trade from
    /// @param subAccountIdOut subaccount id to trade to
    /// @param underlyingIn sold token address
    /// @param underlyingOut bought token address
    /// @param amount amount of token to buy
    /// @param amountInMaximum maximum amount of sold token
    /// @param payload call data passed to Uniswap contract
    /// @param path auxiliary list of pools to use for the trade (used for swap and repay)
    struct SwapExactOutputPayloadParams {
        uint subAccountIdIn;
        uint subAccountIdOut;
        address underlyingIn;
        address underlyingOut;
        uint amount;
        uint amountInMaximum;
        bytes payload;
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
        uint amountInternalIn;
    }

    constructor(bytes32 moduleGitCommit_, address uniswapRouter_, address oneInch_) BaseLogic(MODULEID__SWAP, moduleGitCommit_) {
        uniswapRouter = uniswapRouter_;
        oneInch = oneInch_;
    }

    /// @notice Execute Uniswap V3 exact input trade on a single pool
    /// @param params struct defining trade parameters
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

        swap.amountOut = ISwapRouter02(uniswapRouter).exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: params.fee,
                recipient: address(this),
                amountIn: swap.amountIn,
                amountOutMinimum: params.amountOutMinimum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Execute Uniswap V3 exact input trade routed through multiple pools
    /// @param params struct defining trade parameters
    function swapUniExactInput(SwapUniExactInputParams memory params) external nonReentrant {
        (address underlyingIn, address underlyingOut) = decodeUniV3Path(params.path, false);

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

        swap.amountOut = ISwapRouter02(uniswapRouter).exactInput(
            IV3SwapRouter.ExactInputParams({
                path: params.path,
                recipient: address(this),
                amountIn: swap.amountIn,
                amountOutMinimum: params.amountOutMinimum
            })
        );

        Utils.safeApprove(underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Execute Uniswap V3 exact output trade on a single pool
    /// @param params struct defining trade parameters
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

        Utils.safeApprove(params.underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutputSingle(swap, params);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Execute Uniswap V3 exact output trade routed through multiple pools
    /// @param params struct defining trade parameters
    function swapUniExactOutput(SwapUniExactOutputParams memory params) external nonReentrant {
        (address underlyingIn, address underlyingOut) = decodeUniV3Path(params.path, true);

        SwapCache memory swap = initSwap(
            underlyingIn,
            underlyingOut,
            params.amountOut,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT
        );

        swap.amountOut = params.amountOut;

        Utils.safeApprove(underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutput(swap, params);

        Utils.safeApprove(underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Trade on Uniswap V3 single pool and repay debt with bought asset
    /// @param params struct defining trade parameters (amountOut is ignored)
    /// @param targetDebt amount of debt that is expected to remain after trade and repay (0 to repay full debt)
    function swapAndRepayUniSingle(SwapUniExactOutputSingleParams memory params, uint targetDebt) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            targetDebt,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT_SINGLE_REPAY
        );

        swap.amountOut = getRepayAmount(swap, targetDebt);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutputSingle(swap, params);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwapAndRepay(swap);
    }

    /// @notice Trade on Uniswap V3 through multiple pools pool and repay debt with bought asset
    /// @param params struct defining trade parameters (amountOut is ignored)
    /// @param targetDebt amount of debt that is expected to remain after trade and repay (0 to repay full debt)
    function swapAndRepayUni(SwapUniExactOutputParams memory params, uint targetDebt) external nonReentrant {
        (address underlyingIn, address underlyingOut) = decodeUniV3Path(params.path, true);

        SwapCache memory swap = initSwap(
            underlyingIn,
            underlyingOut,
            targetDebt,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT_REPAY
        );

        swap.amountOut = getRepayAmount(swap, targetDebt);

        Utils.safeApprove(underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutput(swap, params);

        Utils.safeApprove(underlyingIn, uniswapRouter, 0);
        finalizeSwapAndRepay(swap);
    }

    /// @notice Execute Uniswap exact input trade using smart-router-generated calldata
    /// @param params struct defining trade parameters
    function swapUniExactInputPayload(SwapExactInputPayloadParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amount,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_INPUT_PAYLOAD
        );

        setWithdrawAmounts(swap, params.amount);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, swap.amountIn);

        (bool success, bytes memory result) = uniswapRouter.call(params.payload);
        if (!success) revertBytes(result);
        
        swap.amountOut = getAggregatedSwapResult(result);

        require(swap.amountOut >= params.amountOutMinimum, "e/swap/min-amount-out");

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Execute Uniswap exact output trade using smart-router-generated calldata
    /// @param params struct defining trade parameters (path is ignored)
    function swapUniExactOutputPayload(SwapExactOutputPayloadParams memory params) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amount,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT_PAYLOAD
        );

        swap.amountOut = params.amount;

        Utils.safeApprove(params.underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutputPayload(swap, params);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwap(swap);
    }

    /// @notice Trade on Uniswap using smart-router-generated calldata and repay debt with bought asset
    /// @param params struct defining trade parameters
    /// @param targetDebt amount of debt that is expected to remain after trade and repay (0 to repay full debt); ignored if params.path not provided
    function swapAndRepayUniPayload(SwapExactOutputPayloadParams memory params, uint targetDebt) external nonReentrant {
        SwapCache memory swap = initSwap(
            params.underlyingIn,
            params.underlyingOut,
            params.amount,
            params.subAccountIdIn,
            params.subAccountIdOut,
            SWAP_TYPE__UNI_EXACT_OUTPUT_PAYLOAD_REPAY
        );

        swap.amountOut = params.path.length > 0 ? getRepayAmount(swap, targetDebt) : params.amount;

        require(swap.amountOut >= params.amount, "e/swap/repay-amount");

        Utils.safeApprove(params.underlyingIn, uniswapRouter, params.amountInMaximum);
        doSwapUniExactOutputPayload(swap, params);

        Utils.safeApprove(params.underlyingIn, uniswapRouter, 0);
        finalizeSwapAndRepay(swap);
    }

    /// @notice Execute 1Inch V4 trade
    /// @param params struct defining trade parameters
    function swap1Inch(SwapExactInputPayloadParams memory params) external nonReentrant {
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

        Utils.safeApprove(params.underlyingIn, oneInch, 0);
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

    function doSwapUniExactOutputSingle(SwapCache memory swap, SwapUniExactOutputSingleParams memory params) private {
        uint pulledAmountIn = ISwapRouter02(uniswapRouter).exactOutputSingle(
            IV3SwapRouter.ExactOutputSingleParams({
                tokenIn: params.underlyingIn,
                tokenOut: params.underlyingOut,
                fee: params.fee,
                recipient: address(this),
                amountOut: swap.amountOut,
                amountInMaximum: params.amountInMaximum,
                sqrtPriceLimitX96: params.sqrtPriceLimitX96
            })
        );
        require(pulledAmountIn != type(uint).max, "e/swap/exact-out-amount-in");

        setWithdrawAmounts(swap, pulledAmountIn);
    }

    function doSwapUniExactOutput(SwapCache memory swap, SwapUniExactOutputParams memory params) private {
        uint pulledAmountIn = ISwapRouter02(uniswapRouter).exactOutput(
            IV3SwapRouter.ExactOutputParams({
                path: params.path,
                recipient: address(this),
                amountOut: swap.amountOut,
                amountInMaximum: params.amountInMaximum
            })
        );
        require(pulledAmountIn != type(uint).max, "e/swap/exact-out-amount-in");

        setWithdrawAmounts(swap, pulledAmountIn);
    }

    function doSwapUniExactOutputPayload(SwapCache memory swap, SwapExactOutputPayloadParams memory params) private {
        (bool success, bytes memory result) = uniswapRouter.call(params.payload);
        if (!success) revertBytes(result);

        uint pulledAmountIn = getAggregatedSwapResult(result);
        uint outstandingDebt = swap.amountOut > params.amount ? swap.amountOut - params.amount : 0;

        if (outstandingDebt > 0) {
            (bool isUniV2, address[] memory path) = detectAndDecodeUniV2Path(params.path);
            uint amountInMaximum = params.amountInMaximum - pulledAmountIn;

            if (isUniV2) {
                pulledAmountIn += ISwapRouter02(uniswapRouter).swapTokensForExactTokens(outstandingDebt, amountInMaximum, path, address(this));
            } else {
                pulledAmountIn += ISwapRouter02(uniswapRouter).exactOutput(
                    IV3SwapRouter.ExactOutputParams({
                        path: params.path,
                        recipient: address(this),
                        amountOut: outstandingDebt,
                        amountInMaximum: amountInMaximum
                    })
                );
            }
        }

        require(pulledAmountIn != type(uint).max, "e/swap/exact-out-amount-in");

        setWithdrawAmounts(swap, pulledAmountIn);
    }

    function setWithdrawAmounts(SwapCache memory swap, uint amount) private view {
        (amount, swap.amountInternalIn) = withdrawAmounts(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.accountIn, amount);
        require(swap.assetCacheIn.poolSize >= amount, "e/swap/insufficient-pool-size");

        swap.amountIn = amount / swap.assetCacheIn.underlyingDecimalsScaler;
    }

    function finalizeSwap(SwapCache memory swap) private {
        uint balanceIn = checkBalances(swap);

        processWithdraw(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.eTokenIn, swap.accountIn, swap.amountInternalIn, balanceIn);

        processDeposit(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.eTokenOut, swap.accountOut, swap.amountOut);

        checkLiquidity(swap.accountIn);
    }

    function finalizeSwapAndRepay(SwapCache memory swap) private {
        uint balanceIn = checkBalances(swap);

        processWithdraw(eTokenLookup[swap.eTokenIn], swap.assetCacheIn, swap.eTokenIn, swap.accountIn, swap.amountInternalIn, balanceIn);

        processRepay(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.accountOut, swap.amountOut);

        // only checking outgoing account, repay can't lower health score
        checkLiquidity(swap.accountIn);
    }

    function processWithdraw(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amountInternal, uint balanceIn) private {
        assetCache.poolSize = decodeExternalAmount(assetCache, balanceIn);

        decreaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        logAssetStatus(assetCache);
    }

    function processDeposit(AssetStorage storage assetStorage, AssetCache memory assetCache, address eTokenAddress, address account, uint amount) private {
        uint amountDecoded = decodeExternalAmount(assetCache, amount);
        uint amountInternal = underlyingAmountToBalance(assetCache, amountDecoded);

        assetCache.poolSize += amountDecoded;

        increaseBalance(assetStorage, assetCache, eTokenAddress, account, amountInternal);

        if (assetStorage.users[account].owed != 0) checkLiquidity(account);

        logAssetStatus(assetCache);
    }

    function processRepay(AssetStorage storage assetStorage, AssetCache memory assetCache, address account, uint amount) private {
        decreaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, decodeExternalAmount(assetCache, amount));

        logAssetStatus(assetCache);
    }

    function checkBalances(SwapCache memory swap) private view returns (uint) {
        uint balanceIn = callBalanceOf(swap.assetCacheIn, address(this));

        require(balanceIn >= swap.balanceIn - swap.amountIn, "e/swap/balance-in");
        require(callBalanceOf(swap.assetCacheOut, address(this)) >= swap.balanceOut + swap.amountOut, "e/swap/balance-out");

        return balanceIn;
    }

    function decodeUniV3Path(bytes memory path, bool isExactOutput) private pure returns (address, address) {
        require(path.length >= 20 + 3 + 20, "e/swap/uni-path-length");
        require((path.length - 20) % 23 == 0, "e/swap/uni-path-format");

        address token0 = toAddress(path, 0);
        address token1 = toAddress(path, path.length - 20);

        return isExactOutput ? (token1, token0) : (token0, token1);
    }

    function detectAndDecodeUniV2Path(bytes memory path) private pure returns (bool, address[] memory) {
        require(path.length >= 20 + 20, "e/swap/uni-path-length-1");

        bool isUniV2 = path.length % 20 == 0;
        address[] memory addressPath;

        if (isUniV2) {
            uint addressPathSize = path.length / 20;
            addressPath = new address[](addressPathSize);

            for(uint i; i < addressPathSize; ++i) {
                addressPath[i] = toAddress(path, i * 20);
            }
        } else {
            require(path.length >= 20 + 3 + 20, "e/swap/uni-path-length-2");
            require((path.length - 20) % 23 == 0, "e/swap/uni-path-format");            
        }

        return (isUniV2, addressPath);
    }

    function getRepayAmount(SwapCache memory swap, uint targetDebt) private view returns (uint) {
        uint owed = getCurrentOwed(eTokenLookup[swap.eTokenOut], swap.assetCacheOut, swap.accountOut) / swap.assetCacheOut.underlyingDecimalsScaler;
        require (owed > targetDebt, "e/swap/target-debt");
        return owed - targetDebt;
    }

    function toAddress(bytes memory data, uint start) private pure returns (address result) {
        // assuming data length is already validated
        assembly {
            // borrowed from BytesLib https://github.com/GNSPS/solidity-bytes-utils/blob/master/contracts/BytesLib.sol
            result := div(mload(add(add(data, 0x20), start)), 0x1000000000000000000000000)
        }
    }

    /// @notice Decodes the results of the swap and, if needed, sums them up
    /// @param result result of the Uniswap router call
    /// @return decoded result of the swap. if swapped with use of multicall, 
    /// individual calls results are summed up
    function getAggregatedSwapResult(bytes memory result) private pure returns (uint) {
        uint amount;

        if (result.length == 32) {
            amount = abi.decode(result, (uint));
        } else {
            bytes[] memory results = abi.decode(result, (bytes[]));
            for (uint256 i = 0; i < results.length; ++i) {
                amount += abi.decode(results[i], (uint));
            }
        }

        return amount;
    }
}
