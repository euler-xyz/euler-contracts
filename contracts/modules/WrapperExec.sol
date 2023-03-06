// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity ^0.8.0;

import "../BaseLogic.sol";
import "./Governance.sol";
import "./WrapperDeployer.sol";

/// @notice Deploy and work with PTokens and WETokens
contract WrapperExec is BaseLogic {
    constructor(bytes32 moduleGitCommit_) BaseLogic(MODULEID__WRAPPER_EXEC, moduleGitCommit_) {}


    // PTokens


    /// @notice Create a pToken and activate it on Euler. pTokens are protected wrappers around assets that prevent borrowing.
    /// @param underlying The address of an ERC20-compliant token. There must already be an activated market on Euler for this underlying, and it must have a non-zero collateral factor.
    /// @return The created pToken, or an existing one if already activated.
    function activatePToken(address underlying) external nonReentrant returns (address) {
        require(pTokenLookup[underlying] == address(0), "e/nested-ptoken");
        require(weTokenLookup[underlying] == address(0), "e/ptoken/invalid-underlying");

        if (reversePTokenLookup[underlying] != address(0)) return reversePTokenLookup[underlying];

        {
            AssetConfig memory config = resolveAssetConfig(underlying);
            require(config.collateralFactor != 0, "e/ptoken/not-collateral");
        }
 
        bytes memory result = callInternalModule(MODULEID__WRAPPER_DEPLOYER,
                                                 abi.encodeWithSelector(WrapperDeployer.deployPToken.selector, underlying));
        (address pTokenAddr) = abi.decode(result, (address));

        pTokenLookup[pTokenAddr] = underlying;
        reversePTokenLookup[underlying] = pTokenAddr;

        emit PTokenActivated(underlying, pTokenAddr);

        doActivateMarket(pTokenAddr);

        return pTokenAddr;
    }

    /// @notice Transfer underlying tokens from sender's wallet into the pToken wrapper. Allowance should be set for the euler address.
    /// @param underlying Token address
    /// @param amount The amount to wrap in underlying units
    function pTokenWrap(address underlying, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();

        emit PTokenWrap(underlying, msgSender, amount);

        address pTokenAddr = reversePTokenLookup[underlying];
        require(pTokenAddr != address(0), "e/exec/ptoken-not-found");

        {
            uint origBalance = IERC20(underlying).balanceOf(pTokenAddr);
            Utils.safeTransferFrom(underlying, msgSender, pTokenAddr, amount);
            uint newBalance = IERC20(underlying).balanceOf(pTokenAddr);
            require(newBalance == origBalance + amount, "e/exec/ptoken-transfer-mismatch");
        }

        PToken(pTokenAddr).claimSurplus(msgSender);
    }

    /// @notice Transfer underlying tokens from the pToken wrapper to the sender's wallet.
    /// @param underlying Token address
    /// @param amount The amount to unwrap in underlying units
    function pTokenUnWrap(address underlying, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();

        emit PTokenUnWrap(underlying, msgSender, amount);

        address pTokenAddr = reversePTokenLookup[underlying];
        require(pTokenAddr != address(0), "e/exec/ptoken-not-found");

        PToken(pTokenAddr).forceUnwrap(msgSender, amount);
    }


    // WETokens


    /// @notice Struct defining an override for the new weToken.
    /// @param underlying The address of the collateral token.
    /// @param collateralFactor The collateral factor for the override.
    struct OverrideCollateral {
        address underlying;
        uint32 collateralFactor;
    }

    /// @notice Struct defining the configuration of a new weToken.
    /// @param interestRateModel An id of the IRM module to use.
    /// @param interestRateModelResetParams Encoded params used to initialize the IRM if required.
    /// @param reserveFee Reserve fee for the new weToken market.
    /// @param reserveRecipient The address that can claim a part of the reserves.
    /// @param overrideCollaterals An array of tokens that can be used as collateral to borrow the new weToken and collateral factors to use. Use SELF_ADDRESS_PLACEHOLDER to override self-collateral factor. 
    struct WETokenConfig {
        uint interestRateModel;
        bytes interestRateModelResetParams;

        uint32 reserveFee;
        address reserveRecipient;

        OverrideCollateral[] overrideCollaterals;
    }

    address constant SELF_ADDRESS_PLACEHOLDER = address(type(uint160).max);

    /// @notice Create a weToken and activate it on Euler. weTokens are wrappers around eTokens used with config overrides.
    /// @param eToken The address of a valid eToken. Only eTokens with external underlying are valid.
    /// @param config The configuration of the new weToken.
    /// @return The created weToken address.
    function activateWEToken(address eToken, WETokenConfig calldata config) external nonReentrant returns (address) {
        address msgSender = unpackTrailingParamMsgSender();
        bytes memory result = callInternalModule(MODULEID__GOVERNANCE,
                                                 abi.encodeWithSelector(Governance.getGovernorAdmin.selector));
        (address governorAdmin) = abi.decode(result, (address));
        require(msgSender == governorAdmin, "e/gov/unauthorized");


        require(eTokenLookup[eToken].underlying != address(0), "e/wetoken/invalid-etoken");
        require(pTokenLookup[eTokenLookup[eToken].underlying] == address(0), "e/wetoken/invalid-etoken-underlying");
        require(weTokenLookup[eTokenLookup[eToken].underlying] == address(0), "e/nested-wetoken");

        result = callInternalModule(MODULEID__WRAPPER_DEPLOYER,
                                                 abi.encodeWithSelector(WrapperDeployer.deployWEToken.selector, eToken));
        (address weTokenAddr) = abi.decode(result, (address));

        weTokenLookup[weTokenAddr] = eToken;

        emit WETokenActivated(eToken, weTokenAddr);

        doActivateMarket(weTokenAddr);
        AssetStorage storage assetStorage = eTokenLookup[underlyingLookup[weTokenAddr].eTokenAddress];

        // Reserves

        require(config.reserveRecipient != address(0), "e/wetoken/reserve-recipient");
        // TODO max reserve fee? Min reserve fee?
        require(
            config.reserveFee <= RESERVE_FEE_SCALE || config.reserveFee == type(uint32).max,
            "e/wetoken/reserve-fee"
        );
        assetStorage.reserveFee = config.reserveFee;
        weTokenStorage[weTokenAddr].reserveRecipient = config.reserveRecipient;
        weTokenStorage[weTokenAddr].daoReserveShare = type(uint32).max; // resolves to default dao reserves

        // IRM

        AssetCache memory assetCache;
        initAssetCache(weTokenAddr, assetStorage, assetCache);
        setMarketIRM(assetStorage, assetCache, config.interestRateModel, config.interestRateModelResetParams);

        // Overrides

        require(config.overrideCollaterals.length <= MAX_INITIAL_WETOKEN_OVERRIDES, 'e/wetoken/too-many-overrides');

        for (uint i = 0; i < config.overrideCollaterals.length; ++i) {
            OverrideCollateral memory overrideCollateral = config.overrideCollaterals[i];
            OverrideConfig memory overrideConfig = OverrideConfig({
                enabled: true,
                collateralFactor: overrideCollateral.collateralFactor
            });
            address underlying = overrideCollateral.underlying;

            // replace placeholder for the WEToken address for self-collateral override
            if (underlying == SELF_ADDRESS_PLACEHOLDER) underlying = weTokenAddr;
            setCollateralFactorOverride(weTokenAddr, underlying, overrideConfig);
        }

        // TODO emit configs?

        return weTokenAddr;
    }

    /// @notice Transfer underlying eTokens from sender's account into the weToken wrapper. Allowance should be set for the weToken
    /// @param subAccountId The sub-account id to transfer eTokens from
    /// @param weToken weToken address
    /// @param amount The amount to wrap in eToken units (use max_uint256 for full account balance)
    function weTokenWrap(uint subAccountId, address weToken, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit WETokenWrap(weToken, account, amount);

        address eToken = weTokenLookup[weToken];
        require(eToken != address(0), "e/exec/wetoken-not-found");

        AssetStorage storage assetStorage = eTokenLookup[eToken];
        AssetCache memory assetCache = loadAssetCache(assetStorage.underlying, assetStorage);

        if (amount == type(uint).max) amount = assetStorage.users[account].balance;
        transferBalance(assetStorage, assetCache, eToken, account, weToken, amount);

        checkLiquidity(account);
        logAssetStatus(assetCache);

        WEToken(weToken).claimSurplus(msgSender);
    }

    /// @notice Transfer eTokens from the weToken wrapper to the sender's account
    /// @param subAccountId The sub-account id to transfer eTokens to
    /// @param weToken weToken address
    /// @param amount The amount to unwrap in eToken units (use max_uint256 for full account balance)
    function weTokenUnWrap(uint subAccountId, address weToken, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        address account = getSubAccount(msgSender, subAccountId);

        emit WETokenUnWrap(weToken, account, amount);

        address eToken = weTokenLookup[weToken];
        require(eToken != address(0), "e/exec/wetoken-not-found");

        AssetStorage storage assetStorage = eTokenLookup[eToken];
        AssetCache memory assetCache = loadAssetCache(assetStorage.underlying, assetStorage);

        // if amount is max_uint256, the token will credit full balance and return it
        amount = WEToken(weToken).creditUnwrap(msgSender, amount);

        transferBalance(assetStorage, assetCache, eToken, weToken, account, amount);

        logAssetStatus(assetCache);
    }

    /// @notice Claim WEToken market reserves pertaining to the market creator
    /// @param weToken WEToken address
    /// @param amount Amount requested
    function claimWETokenReserves(address weToken, uint amount) external nonReentrant {
        address msgSender = unpackTrailingParamMsgSender();
        require(msgSender == weTokenStorage[weToken].reserveRecipient, "e/unauthorized");

        address eweTokenAddress = underlyingLookup[weToken].eTokenAddress;
        require(eweTokenAddress != address(0), "e/exec/underlying-not-activated");

        updateAverageLiquidity(msgSender);

        emit RequestClaimWETokenReserves(weToken, msgSender);

        AssetStorage storage assetStorage = eTokenLookup[eweTokenAddress];
        require(assetStorage.reserveBalance >= INITIAL_RESERVES, "e/exec/reserves-depleted");
        AssetCache memory assetCache = loadAssetCache(weToken, assetStorage);

        WETokenStorage storage weTokenData = weTokenStorage[weToken];

        uint maxAmount = assetCache.reserveBalance - INITIAL_RESERVES;
        uint newReserves = maxAmount - weTokenData.daoReserves - weTokenData.recipientReserves;
        uint32 daoReserveShare = resolveDaoReserveShare(weTokenData);

        weTokenData.daoReserves += uint96(newReserves * daoReserveShare / RESERVE_FEE_SCALE);
        maxAmount -= weTokenData.daoReserves;

        if (amount == type(uint).max) amount = maxAmount;
        require(amount <= maxAmount, "e/gov/insufficient-reserves");

        weTokenData.recipientReserves = uint96(maxAmount - amount);

        assetStorage.reserveBalance = assetCache.reserveBalance = assetCache.reserveBalance - uint96(amount);
        // Decrease totalBalances because increaseBalance will increase it by amount
        assetStorage.totalBalances = assetCache.totalBalances = encodeAmount(assetCache.totalBalances - amount);

        increaseBalance(assetStorage, assetCache, eweTokenAddress, msgSender, amount);

        logAssetStatus(assetCache);
    }

    /// @notice Returns the total claimable amount of WEToken reserves pertaining to the market creator
    /// @param weToken WEToken address
    /// @return Amount of claimable reserves in eToken units
    function getClaimableWETokenReserves(address weToken) external view returns (uint) {
        address eweToken = underlyingLookup[weToken].eTokenAddress;
        require(eweToken != address(0), 'e/exec/invalid-wetoken');

        AssetStorage storage assetStorage = eTokenLookup[eweToken];
        AssetCache memory assetCache = loadAssetCacheRO(weToken, assetStorage);
        WETokenStorage storage weTokenData = weTokenStorage[weToken];
        uint32 daoReserveShare = resolveDaoReserveShare(weTokenData);

        uint newReserves = assetCache.reserveBalance - INITIAL_RESERVES - weTokenData.daoReserves - weTokenData.recipientReserves;
        uint currentDaoReserves = weTokenData.daoReserves + newReserves * daoReserveShare / RESERVE_FEE_SCALE;

        return assetCache.reserveBalance - INITIAL_RESERVES - currentDaoReserves;
    }


    /// @notice Sets a new reserves recipient for WEToken
    /// @param weToken WEToken address
    /// @param newReserveRecipient Address of the new reserve recipient
    function setWETokenReserveRecipient(address weToken, address newReserveRecipient) external nonReentrant {
        require(weTokenLookup[weToken] != address(0), 'e/invalid-wetoken');
        address msgSender = unpackTrailingParamMsgSender();
        WETokenStorage storage weTokenStorage = weTokenStorage[weToken];
        require(msgSender == weTokenStorage.reserveRecipient, 'e/wetoken/unauthorized');

        require(newReserveRecipient != address(0), 'e/wetoken/invalid-reserve-recipient');

        weTokenStorage.reserveRecipient = newReserveRecipient;
    }


    /// @notice Retrieves the reserves config for WEToken
    /// @param weToken WEToken address
    /// @return reserveRecipient Address allowed to claim reserves not belonging to the DAO
    /// @return daoReserveShare Amount of reserve share belonging to the DAO, as a fraction scaled by RESERVE_FEE_SCALE (4e9)
    function getWETokenReservesConfig(address weToken) external view returns (address reserveRecipient, uint32 daoReserveShare) {
        require(weTokenLookup[weToken] != address(0), 'e/invalid-wetoken');
        WETokenStorage storage weTokenStorage = weTokenStorage[weToken];

        reserveRecipient = weTokenStorage.reserveRecipient;
        daoReserveShare = resolveDaoReserveShare(weTokenStorage);
    }
}

