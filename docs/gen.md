# Euler Contract Interfaces

## IEulerEToken

Tokenised representation of assets

### name

Pool name, ie "Euler Pool: DAI"

    function name() external returns (string memory)






### symbol

Pool symbol, ie "eDAI"

    function symbol() external returns (string memory)






### decimals

Decimals, always normalised to 18.

    function decimals() external returns (uint8)






### totalSupply

Sum of all balances, in internal book-keeping units (non-increasing)

    function totalSupply() external returns (uint)






### totalSupplyUnderlying

Sum of all balances, in underlying units (increases as interest is earned)

    function totalSupplyUnderlying() external returns (uint)






### balanceOf

Balance of a particular account, in internal book-keeping units (non-increasing)

    function balanceOf(address account) external returns (uint)






### balanceOfUnderlying

Balance of a particular account, in underlying units (increases as interest is earned)

    function balanceOfUnderlying(address account) external returns (uint)






### reserveBalance

Balance of the reserves, in internal book-keeping units (non-increasing)

    function reserveBalance() external returns (uint)






### reserveBalanceUnderlying

Balance of the reserves, in underlying units (increases as interest is earned)

    function reserveBalanceUnderlying() external returns (uint)






### deposit

Transfer underlying tokens from sender to the Euler pool, and increase account's eTokens

    function deposit(uint subAccountId, uint amount) external


Parameters:

* **subAccountId**: 
* **amount**: In underlying units (use max uint256 for full underlying token balance)



### withdraw

Transfer underlying tokens from Euler pool to sender, and decrease account's eTokens

    function withdraw(uint subAccountId, uint amount) external


Parameters:

* **subAccountId**: 
* **amount**: In underlying units (use max uint256 for full pool balance)



### mint

Mint eTokens and an corresponding amount of dTokens ("self-borrow")

    function mint(uint subAccountId, uint amount) external


Parameters:

* **subAccountId**: 
* **amount**: In underlying units



### burn

Pay off dToken liability with eTokens ("self-repay")

    function burn(uint subAccountId, uint amount) external


Parameters:

* **subAccountId**: 
* **amount**: In underlying units (use max uint256 to repay full dToken balance)



### approve

Allow spender to access an amount of your eTokens in sub-account 0

    function approve(address spender, uint amount) external returns (bool)


Parameters:

* **spender**: 
* **amount**: Use max uint256 for "infinite" allowance



### approveSubAccount

Allow spender to access an amount of your eTokens in a particular sub-account

    function approveSubAccount(uint subAccountId, address spender, uint amount) external returns (bool)


Parameters:

* **subAccountId**: 
* **spender**: 
* **amount**: Use max uint256 for "infinite" allowance



### allowance

Retrieve the current allowance

    function allowance(address holder, address spender) external returns (uint)


Parameters:

* **holder**: Xor with the desired sub-account ID (if applicable)
* **spender**: 



### transfer

Transfer eTokens to another address (from sub-account 0)

    function transfer(address to, uint amount) external returns (bool)


Parameters:

* **to**: Xor with the desired sub-account ID (if applicable)
* **amount**: In internal book-keeping units (as returned from balanceOf)



### transferFrom

Transfer eTokens from one address to another

    function transferFrom(address from, address to, uint amount) external returns (bool)


Parameters:

* **from**: This address must've approved the to address, or be a sub-account of msg.sender
* **to**: Xor with the desired sub-account ID (if applicable)
* **amount**: In internal book-keeping units (as returned from balanceOf)



