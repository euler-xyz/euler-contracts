// erc20 methods
methods {
    myAddress()                           returns (address) => DISPATCHER(true)
    totalSupply()                         returns (uint256) => DISPATCHER(true)
    balanceOf(address)                    returns (uint256) => DISPATCHER(true) 
	transfer(address,uint256)             returns (bool)    => DISPATCHER(true) 
    allowance(address,address)                              => DISPATCHER(true)
    approve(address,uint256)              returns (bool)    => DISPATCHER(true)
    transferFrom(address,address,uint256) returns (bool)    => DISPATCHER(true) 
}