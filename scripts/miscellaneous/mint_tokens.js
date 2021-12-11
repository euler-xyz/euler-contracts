const ropstenConfig = require('../../euler-contracts/test/lib/token-setups/ropsten');
const hre = require("hardhat");
const ethers = hre.ethers;
const et = require("../../euler-contracts/test/lib/eTestLib");


let tokenPrices = [
    {
        token: "LINK",
        price: 0,
        fee: 3000,
        decimals: 18 
    },
    /* {
        token: "renBTC",
        price: 0,
        fee: 500,
        decimals: 8    
    }, */
    {
        token: "renDOGE",
        price: 0,
        fee: 3000,
        decimals: 8    
    },
    {
        token: "BAT",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "MKR",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "WBTC",
        price: 0,
        fee: 3000,
        decimals: 18
    },   
    {
        token: "LUSD",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "MANA",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "CELR",
        price: 0,
        fee: 3000,
        decimals: 18    
    },  
    /* {
        token: "CVX",
        price: 0,
        fee: 3000,
        decimals: 18    
    }, */
    {
        token: "AAVE",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "CRV",
        price: 0,
        fee: 3000,
        decimals: 18    
    },
    {
        token: "COMP",
        price: 0,
        fee: 3000,
        decimals: 18  
    },
    {
        token: "UNI",
        price: 0,
        fee: 3000,
        decimals: 18 
    },
    {
        token: "REP",
        price: 0,
        fee: 3000,
        decimals: 18 
    },
    {
        token: "BZRX",
        price: 0,
        fee: 3000,
        decimals: 18 
    },
    {
        token: "DOUGH",
        price: 0,
        fee: 3000,
        decimals: 18
    },
    {
        token: "DAI",
        price: 0,
        fee: 3000,
        decimals: 18 
    }, 
    {
        token: "USDC",
        price: 0,
        fee: 500,
        decimals: 6 
    },
    {
        token: "USDT",
        price: 0,
        fee: 500,
        decimals: 6
    },
]

async function sendERC20(address, amount) {
    const ctx = await et.getTaskCtx();
    const { abi, bytecode, } = require('../../artifacts/contracts/test/TestERC20.sol/TestERC20.json');
    /* let min = 0 
    let max = 17
    let arr = []
    while(arr.length < 5){
        let randomnumber=Math.floor(Math.random() * (max - min + 1)) + min
        if(arr.indexOf(randomnumber) === -1){arr.push(randomnumber)}  
    }

    for (i = 0;i < arr.length; i++) {
        console.log("Transferring", tokenPrices[arr[i]].token)
        let erc20Token = new ethers.Contract(
            ropstenConfig.existingTokens[tokenPrices[arr[i]].token].address, 
            abi, 
            ctx.wallet
        );
        let tokenDecimals = await erc20Token.decimals()
        let estimation = await erc20Token.estimateGas.transfer(address, ethers.BigNumber.from(10).pow(tokenDecimals).mul(amount)); //amount * Math.pow(10, tokenDecimals));
        let gasPrice = 10e11; // 800 Gwei
        let gasLimit = Math.floor(estimation * 1.01 + 1000); 
        let tx = await erc20Token.transfer(address, ethers.BigNumber.from(10).pow(tokenDecimals).mul(amount), {gasPrice: gasPrice, gasLimit: gasLimit}); //amount * Math.pow(10, tokenDecimals));
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
    } */
    /* for (let listedToken of tokenPrices) {
        let erc20Token = new ethers.Contract(
            ropstenConfig.existingTokens[tokenPrices[arr[i]].token].address, 
            abi, 
            ctx.wallet
        );
        let tokenDecimals = await erc20Token.decimals()
        let estimation = await erc20Token.estimateGas.transfer(address, ethers.BigNumber.from(10).pow(tokenDecimals).mul(amount)); //amount * Math.pow(10, tokenDecimals));
        let gasPrice = 10e11; // 800 Gwei
        let gasLimit = Math.floor(estimation * 1.01 + 1000); 
        let tx = await erc20Token.transfer(address, ethers.BigNumber.from(10).pow(tokenDecimals).mul(amount), {gasPrice: gasPrice, gasLimit: gasLimit}); //amount * Math.pow(10, tokenDecimals));
        console.log(`Transaction: ${tx.hash} (on ${hre.network.name})`);
        
        //let result = await tx.wait();
        //console.log(`Mined. Status: ${result.status}`);
        //console.log(`${tokenPrices[arr[i]].token} sent to ${address}`);
    } */
    console.log("MINT JOB FINISHED")
}
sendERC20("0xac6deC78e18364b302dcE499f5B87dD142DAC5B8", 500)