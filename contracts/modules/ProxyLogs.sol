// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "./Governance.sol";
import "./Liquidation.sol";
import "./DToken.sol";
import "./EToken.sol";
import "./Markets.sol";
import "./Exec.sol";


/// @notice Stub Module to test if Proxy emits logs

contract ProxyLogs is BaseLogic { 
    constructor() BaseLogic(MODULEID__PROXYLOGS) {}

    
    // Events

    //_________DToken Events_________________________ 
    // emit RequestBorrow(account, amount);
    // emit RequestBorrow(account, amount);
    // emit RequestRepay(account, amount);
    // emit RequestTransferDToken(from, to, amount);


    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// -notice Transfer underlying tokens from the Euler pool to the sender, and increase sender's dTokens
    /// -param subAccountId 0 for primary, 1-255 for a sub-account
    /// -param amount In underlying units (use max uint256 for all available tokens)

    function CALLER_D() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        address eTokenAddress = dTokenLookup[proxyAddr];
        require(eTokenAddress != address(0), "e/unrecognized-dtoken-caller");
        assetStorage = eTokenLookup[eTokenAddress];
        underlying = assetStorage.underlying;
    }

    function borrow(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_D();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestBorrow(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) {
            amount = assetCache.poolSize;
        } else {
            amount = decodeExternalAmount(assetCache, amount);
        }

        require(amount <= assetCache.poolSize, "e/insufficient-tokens-available");

        pushTokens(assetCache, msgSender, amount);

        increaseBorrow(assetStorage, assetCache, proxyAddr, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }

    /// @notice Transfer underlying tokens from the sender to the Euler pool, and decrease sender's dTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for full debt owed)

    function repay(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_D();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestRepay(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount != type(uint).max) {
            amount = decodeExternalAmount(assetCache, amount);
        }

        uint owed = getCurrentOwed(assetStorage, assetCache, account);
        if (amount > owed) amount = owed;
        if (owed == 0) return;

        amount = pullTokens(assetCache, msgSender, amount);

        decreaseBorrow(assetStorage, assetCache, proxyAddr, account, amount);

        logAssetStatus(assetCache);
    }

    /// @notice Transfer dTokens from one address to another
    /// @param from Xor with the desired sub-account ID (if applicable)
    /// @param to This address must've approved the from address, or be a sub-account of msg.sender
    /// @param amount In underlying. Use max uint256 for full balance.

    function transferFrom_D(address from, address to, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_D();
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        updateAverageLiquidity(from);
        updateAverageLiquidity(to);
        emit RequestTransferDToken(from, to, amount);

        if (amount == type(uint).max) amount = getCurrentOwed(assetStorage, assetCache, from);
        else amount = decodeExternalAmount(assetCache, amount);

        if (amount == 0) return true;

        if (!isSubAccountOf(msgSender, to) && assetStorage.dTokenAllowance[to][msgSender] != type(uint).max) {
            require(assetStorage.dTokenAllowance[to][msgSender] >= amount, "e/insufficient-allowance");
            unchecked { assetStorage.dTokenAllowance[to][msgSender] -= amount; }
        }

        transferBorrow(assetStorage, assetCache, proxyAddr, from, to, amount);

        checkLiquidity(to);

        return true;
    }

    //__________EToken Events___________________

    /// -notice Transfer underlying tokens from Euler pool to sender, and decrease account's eTokens
    /// -param subAccountId 0 for primary, 1-255 for a sub-account
    /// -param amount In underlying units (use max uint256 for full pool balance)

    function CALLER_E() private view returns (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) {
        (msgSender, proxyAddr) = unpackTrailingParams();
        assetStorage = eTokenLookup[proxyAddr];
        underlying = assetStorage.underlying;
        require(underlying != address(0), "e/unrecognized-etoken-caller");
    }

    function withdraw_E(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_E();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestWithdraw(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint amountInternal;

        if (amount == type(uint).max) {
            amountInternal = assetStorage.users[account].balance;
            amount = balanceToUnderlyingAmount(assetCache, amountInternal);
        } else {
            amount = decodeExternalAmount(assetCache, amount);
            amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
        }

        require(assetCache.poolSize >= amount, "e/insufficient-pool-size");
        pushTokens(assetCache, msgSender, amount);

        decreaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        checkLiquidity(account);

        logAssetStatus(assetCache);
    }

    /// @notice Transfer underlying tokens from Euler pool to sender, and decrease account's eTokens
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 for full pool balance)

    function withdraw(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_E();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestWithdraw(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        uint amountInternal;

        if (amount == type(uint).max) {
            amountInternal = assetStorage.users[account].balance;
            amount = balanceToUnderlyingAmount(assetCache, amountInternal);
        } else {
            amount = decodeExternalAmount(assetCache, amount);
            amountInternal = balanceFromUnderlyingAmount(assetCache, amount);
        }

        require(assetCache.poolSize >= amount, "e/insufficient-pool-size");
        pushTokens(assetCache, msgSender, amount);

        decreaseBalance(assetStorage, assetCache, proxyAddr, account, amountInternal);

        checkLiquidity(account);

        logAssetStatus(assetCache);
    }

    /// @notice Mint eTokens and a corresponding amount of dTokens ("self-borrow")
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units

    function mint(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_E();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestMint(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        amount = decodeExternalAmount(assetCache, amount);

        // Mint ETokens

        increaseBalance(assetStorage, assetCache, proxyAddr, account, balanceFromUnderlyingAmount(assetCache, amount));

        // Mint DTokens

        increaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }

    /// @notice Pay off dToken liability with eTokens ("self-repay")
    /// @param subAccountId 0 for primary, 1-255 for a sub-account
    /// @param amount In underlying units (use max uint256 to repay full dToken balance)

    function burn(uint subAccountId, uint amount) external nonReentrant {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_E();
        address account = getSubAccount(msgSender, subAccountId);

        updateAverageLiquidity(account);
        emit RequestBurn(account, amount);

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount != type(uint).max) {
            amount = decodeExternalAmount(assetCache, amount);
        }

        uint owed = getCurrentOwed(assetStorage, assetCache, account);
        if (amount > owed) amount = owed;
        if (owed == 0) return;

        // Burn ETokens

        decreaseBalance(assetStorage, assetCache, proxyAddr, account, balanceFromUnderlyingAmount(assetCache, amount));

        // Burn DTokens

        decreaseBorrow(assetStorage, assetCache, assetStorage.dTokenAddress, account, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);
    }

    /// @notice Transfer eTokens from one address to another
    /// @param from This address must've approved the to address, or be a sub-account of msg.sender
    /// @param to Xor with the desired sub-account ID (if applicable)
    /// @param amount In internal book-keeping units (as returned from balanceOf). Use max uint256 for full balance.

    function transferFrom(address from, address to, uint amount) public nonReentrant returns (bool) {
        (address underlying, AssetStorage storage assetStorage, address proxyAddr, address msgSender) = CALLER_E();

        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (from == address(0)) from = msgSender;
        require(from != to, "e/self-transfer");

        updateAverageLiquidity(from);
        updateAverageLiquidity(to);
        emit RequestTransferEToken(from, to, amount);

        if (amount == type(uint).max) amount = assetStorage.users[from].balance;

        if (amount == 0) return true;

        if (!isSubAccountOf(msgSender, from) && assetStorage.eTokenAllowance[from][msgSender] != type(uint).max) {
            require(assetStorage.eTokenAllowance[from][msgSender] >= amount, "e/insufficient-allowance");
            unchecked { assetStorage.eTokenAllowance[from][msgSender] -= amount; }
        }

        transferBalance(assetStorage, assetCache, proxyAddr, from, to, amount);

        checkLiquidity(from);

        return true;
    }

    //_________Exec Events___________________________
    
    // emit TrackAverageLiquidity(account);
    // emit UnTrackAverageLiquidity(account);

    // Average liquidity tracking

    /// @notice Enable average liquidity tracking for your account. Operations will cost more gas, but you may get additional benefits when performing liquidations
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account
    function trackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit TrackAverageLiquidity(account);

        accountLookup[account].lastAverageLiquidityUpdate = uint40(block.timestamp);
        accountLookup[account].averageLiquidity = 0;
    }

    /// @notice Disable average liquidity tracking for your account
    /// @param subAccountId subAccountId 0 for primary, 1-255 for a sub-account
    function unTrackAverageLiquidity(uint subAccountId) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit UnTrackAverageLiquidity(account);

        accountLookup[account].lastAverageLiquidityUpdate = 0;
        accountLookup[account].averageLiquidity = 0;
    }

    //___________Governance Events______________________
    
    // emit ReservesConverted(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));


     modifier governorOnly {
        address msgSender = unpackTrailingParamMsgSender();

        require(msgSender == governorAdmin, "e/gov/unauthorized");
        _;
    }

    function convertReserves(address underlying, address recipient, uint amount) external nonReentrant governorOnly {
        address eTokenAddress = underlyingLookup[underlying].eTokenAddress;
        require(eTokenAddress != address(0), "e/gov/underlying-not-activated");

        updateAverageLiquidity(recipient);

        AssetStorage storage assetStorage = eTokenLookup[eTokenAddress];
        AssetCache memory assetCache = loadAssetCache(underlying, assetStorage);

        if (amount == type(uint).max) amount = assetStorage.reserveBalance;
        require(amount <= assetStorage.reserveBalance, "e/gov/insufficient-reserves");

        emit ReservesConverted(underlying, recipient, balanceToUnderlyingAmount(assetCache, amount));

        assetStorage.reserveBalance = assetCache.reserveBalance = assetCache.reserveBalance - uint96(amount);
        // Decrease totalBalances because increaseBalance will increase it by amount
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eTokenAddress, recipient, amount);

        logAssetStatus(assetCache);
    }

    //____________Liquidation Events______________________
    
    // emit RequestLiquidate(liquidator, violator, underlying, collateral, repay, minYield);
    // emit Liquidation(liqLocs.liquidator, liqLocs.violator, liqLocs.underlying, liqLocs.collateral, repay, yield, liqLocs.liqOpp.healthScore, liqLocs.liqOpp.baseDiscount, liqLocs.liqOpp.discount);


    struct LiquidationOpportunity {
        uint repay;
        uint yield;
        uint healthScore;

        // Only populated if repay > 0:
        uint baseDiscount;
        uint discount;
        uint conversionRate;
    }

     struct LiquidationLocals {
        address liquidator;
        address violator;
        address underlying;
        address collateral;

        uint underlyingPrice;
        uint collateralPrice;

        LiquidationOpportunity liqOpp;

        uint repayPreFees;
    }

    // How much of a liquidation is credited to the underlying's reserves.
    uint private constant UNDERLYING_RESERVES_FEE = 0.01 * 1e18;

    // Maximum discount that can be awarded under any conditions.
    uint private constant MAXIMUM_DISCOUNT = 0.25 * 1e18;

    // How much faster the bonus grows for a fully funded supplier. Partially-funded suppliers
    // have this scaled proportional to their free-liquidity divided by the violator's liability.
    uint private constant SUPPLIER_BONUS_SLOPE = 2 * 1e18;

    // How much supplier discount can be awarded beyond the base discount.
    uint private constant MAXIMUM_SUPPLIER_BONUS = 0.025 * 1e18;

    // Post-liquidation target health score that limits maximum liquidation sizes.
    uint private constant TARGET_HEALTH = 1.2 * 1e18;


    function computeLiqOpp(LiquidationLocals memory liqLocs) private {
        liqLocs.underlyingPrice = getAssetPrice(liqLocs.underlying);
        liqLocs.collateralPrice = getAssetPrice(liqLocs.collateral);

        LiquidationOpportunity memory liqOpp = liqLocs.liqOpp;

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);

        liqOpp.repay = liqOpp.yield = 0;

        (uint collateralValue, uint liabilityValue) = getAccountLiquidity(liqLocs.violator);

        if (liabilityValue == 0) {
            liqOpp.healthScore = type(uint).max;
            return; // no violation
        }

        liqOpp.healthScore = collateralValue * 1e18 / liabilityValue;

        if (collateralValue >= liabilityValue) {
            return; // no violation
        }

        // At this point healthScore must be < 1 since collateral < liability

        // Compute discount

        {
            uint baseDiscount = UNDERLYING_RESERVES_FEE + (1e18 - liqOpp.healthScore);

            uint supplierBonus = computeSupplierBonus(liqLocs.liquidator, liabilityValue);

            uint discount = baseDiscount * supplierBonus / 1e18;

            if (discount > (baseDiscount + MAXIMUM_SUPPLIER_BONUS)) discount = baseDiscount + MAXIMUM_SUPPLIER_BONUS;
            if (discount > MAXIMUM_DISCOUNT) discount = MAXIMUM_DISCOUNT;

            liqOpp.baseDiscount = baseDiscount;
            liqOpp.discount = discount;
            liqOpp.conversionRate = liqLocs.underlyingPrice * 1e18 / liqLocs.collateralPrice * 1e18 / (1e18 - discount);
        }

        // Determine amount to repay to bring user to target health

        AssetConfig memory underlyingConfig = resolveAssetConfig(liqLocs.underlying);
        AssetConfig memory collateralConfig = resolveAssetConfig(liqLocs.collateral);

        {
            uint liabilityValueTarget = liabilityValue * TARGET_HEALTH / 1e18;

            // These factors are first converted into standard 1e18-scale fractions, then adjusted as described in the whitepaper:
            uint borrowAdj = TARGET_HEALTH * CONFIG_FACTOR_SCALE / underlyingConfig.borrowFactor;
            uint collateralAdj = 1e18 * uint(collateralConfig.collateralFactor) / CONFIG_FACTOR_SCALE * 1e18 / (1e18 - liqOpp.discount);

            uint maxRepayInReference;

            if (liabilityValueTarget <= collateralValue) {
                maxRepayInReference = 0;
            } else if (borrowAdj <= collateralAdj) {
                maxRepayInReference = type(uint).max;
            } else {
                maxRepayInReference = (liabilityValueTarget - collateralValue) * 1e18 / (borrowAdj - collateralAdj);
            }

            liqOpp.repay = maxRepayInReference * 1e18 / liqLocs.underlyingPrice;
        }

        // Limit repay to current owed
        // This can happen when there are multiple borrows and liquidating this one won't bring the violator back to solvency

        {
            uint currentOwed = getCurrentOwed(underlyingAssetStorage, underlyingAssetCache, liqLocs.violator);
            if (liqOpp.repay > currentOwed) liqOpp.repay = currentOwed;
        }

        // Limit yield to borrower's available collateral, and reduce repay if necessary
        // This can happen when borrower has multiple collaterals and seizing all of this one won't bring the violator back to solvency

        liqOpp.yield = liqOpp.repay * liqOpp.conversionRate / 1e18;

        {
            uint collateralBalance = balanceToUnderlyingAmount(collateralAssetCache, collateralAssetStorage.users[liqLocs.violator].balance);

            if (collateralBalance < liqOpp.yield) {
                liqOpp.repay = collateralBalance * 1e18 / liqOpp.conversionRate;
                liqOpp.yield = collateralBalance;
            }
        }

        // Adjust repay to account for reserves fee

        liqLocs.repayPreFees = liqOpp.repay;
        liqOpp.repay = liqOpp.repay * (1e18 + UNDERLYING_RESERVES_FEE) / 1e18;
    }

    function executeLiquidation(LiquidationLocals memory liqLocs, uint desiredRepay, uint minYield) private {
        if (desiredRepay == 0) return;
        require(desiredRepay <= liqLocs.liqOpp.repay, "e/liq/excessive-repay-amount");

        AssetStorage storage underlyingAssetStorage = eTokenLookup[underlyingLookup[liqLocs.underlying].eTokenAddress];
        AssetCache memory underlyingAssetCache = loadAssetCache(liqLocs.underlying, underlyingAssetStorage);

        AssetStorage storage collateralAssetStorage = eTokenLookup[underlyingLookup[liqLocs.collateral].eTokenAddress];
        AssetCache memory collateralAssetCache = loadAssetCache(liqLocs.collateral, collateralAssetStorage);


        uint repay;

        if (desiredRepay == liqLocs.liqOpp.repay) repay = liqLocs.repayPreFees;
        else repay = desiredRepay * (1e18 * 1e18 / (1e18 + UNDERLYING_RESERVES_FEE)) / 1e18;

        {
            uint repayExtra = desiredRepay - repay;

            // Liquidator takes on violator's debt:

            transferBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.violator, liqLocs.liquidator, repay);

            // Extra debt is minted and assigned to liquidator:

            increaseBorrow(underlyingAssetStorage, underlyingAssetCache, underlyingAssetStorage.dTokenAddress, liqLocs.liquidator, repayExtra);

            // The underlying's reserve is credited to compensate for this extra debt:

            {
                uint poolAssets = underlyingAssetCache.poolSize + (underlyingAssetCache.totalBorrows / INTERNAL_DEBT_PRECISION);
                uint newTotalBalances = poolAssets * underlyingAssetCache.totalBalances / (poolAssets - repayExtra);
                increaseReserves(underlyingAssetStorage, underlyingAssetCache, newTotalBalances - underlyingAssetCache.totalBalances);
            }
        }


        uint yield = repay * liqLocs.liqOpp.conversionRate / 1e18;
        require(yield >= minYield, "e/liq/min-yield");

        // Liquidator gets violator's collateral:

        address eTokenAddress = underlyingLookup[collateralAssetCache.underlying].eTokenAddress;

        transferBalance(collateralAssetStorage, collateralAssetCache, eTokenAddress, liqLocs.violator, liqLocs.liquidator, balanceFromUnderlyingAmount(collateralAssetCache, yield));


        // Since liquidator is taking on new debt, liquidity must be checked:

        checkLiquidity(liqLocs.liquidator);


        emitLiquidationLog(liqLocs, repay, yield);
        logAssetStatus(underlyingAssetCache);
        logAssetStatus(collateralAssetCache);
    }


    // Returns 1e18-scale fraction > 1 representing how much faster the bonus grows for this liquidator

    function computeSupplierBonus(address liquidator, uint violatorLiabilityValue) private returns (uint) {
        uint bonus = getUpdatedAverageLiquidity(liquidator) * 1e18 / violatorLiabilityValue;
        if (bonus > 1e18) bonus = 1e18;

        bonus = bonus * (SUPPLIER_BONUS_SLOPE - 1e18) / 1e18;

        return bonus + 1e18;
    }


    function liquidate(address violator, address underlying, address collateral, uint repay, uint minYield) external nonReentrant {
        address liquidator = unpackTrailingParamMsgSender();

        emit RequestLiquidate(liquidator, violator, underlying, collateral, repay, minYield);

        require(!isSubAccountOf(violator, liquidator), "e/liq/self-liquidation");
        require(!accountLookup[violator].liquidityCheckInProgress, "e/liq/violator-liquidity-deferred");
        require(isEnteredInMarket(violator, underlying), "e/liq/violator-not-entered-underlying");
        require(isEnteredInMarket(violator, collateral), "e/liq/violator-not-entered-collateral");

        updateAverageLiquidity(liquidator);
        updateAverageLiquidity(violator);


        LiquidationLocals memory liqLocs;

        liqLocs.liquidator = liquidator;
        liqLocs.violator = violator;
        liqLocs.underlying = underlying;
        liqLocs.collateral = collateral;

        computeLiqOpp(liqLocs);


        executeLiquidation(liqLocs, repay, minYield);
    }

    function emitLiquidationLog(LiquidationLocals memory liqLocs, uint repay, uint yield) private {
        emit Liquidation(liqLocs.liquidator, liqLocs.violator, liqLocs.underlying, liqLocs.collateral, repay, yield, liqLocs.liqOpp.healthScore, liqLocs.liqOpp.baseDiscount, liqLocs.liqOpp.discount);
    }

    //____________Markets Events___________________
    
    // emit MarketActivated(underlying, childEToken, childDToken);
    // emit PTokenActivated(underlying, pTokenAddr);


    function doActivateMarket(address underlying) private returns (address) {
        // Pre-existing

        if (underlyingLookup[underlying].eTokenAddress != address(0)) return underlyingLookup[underlying].eTokenAddress;


        // Validation

        require(trustedSenders[underlying].moduleId == 0 && underlying != address(this), "e/markets/invalid-token");

        uint8 decimals = IERC20(underlying).decimals();
        require(decimals <= 18, "e/too-many-decimals");


        // Get risk manager parameters

        IRiskManager.NewMarketParameters memory params;

        {
            bytes memory result = callInternalModule(MODULEID__RISK_MANAGER,
                                                     abi.encodeWithSelector(IRiskManager.getNewMarketParameters.selector, underlying));
            (params) = abi.decode(result, (IRiskManager.NewMarketParameters));
        }


        // Create proxies

        address childEToken = params.config.eTokenAddress = _createProxy(MODULEID__ETOKEN);
        address childDToken = _createProxy(MODULEID__DTOKEN);


        // Setup storage

        underlyingLookup[underlying] = params.config;

        dTokenLookup[address(childDToken)] = childEToken;

        AssetStorage storage assetStorage = eTokenLookup[childEToken];

        assetStorage.underlying = underlying;
        assetStorage.pricingType = params.pricingType;
        assetStorage.pricingParameters = params.pricingParameters;

        assetStorage.dTokenAddress = childDToken;

        assetStorage.lastInterestAccumulatorUpdate = uint40(block.timestamp);
        assetStorage.underlyingDecimals = decimals;
        assetStorage.interestRateModel = uint32(MODULEID__IRM_DEFAULT);
        assetStorage.reserveFee = type(uint32).max; // default

        assetStorage.interestAccumulator = INITIAL_INTEREST_ACCUMULATOR;


        emit MarketActivated(underlying, childEToken, childDToken);

        return childEToken;
    }


    /// @notice Create a pToken and activate it on Euler. pTokens are protected wrappers around assets that prevent borrowing.
    /// @param underlying The address of an ERC20-compliant token. There must already be an activated market on Euler for this underlying, and it must have a non-zero collateral factor.
    /// @return The created pToken, or an existing one if already activated.

    function activatePToken(address underlying) external nonReentrant returns (address) {
        if (reversePTokenLookup[underlying] != address(0)) return reversePTokenLookup[underlying];

        {
            AssetConfig memory config = resolveAssetConfig(underlying);
            require(config.collateralFactor != 0, "e/ptoken/not-collateral");
        }
 
        address pTokenAddr = address(new PToken(address(this), underlying));

        pTokenLookup[pTokenAddr] = underlying;
        reversePTokenLookup[underlying] = pTokenAddr;

        emit PTokenActivated(underlying, pTokenAddr);

        doActivateMarket(pTokenAddr);

        return pTokenAddr;
    }
}
