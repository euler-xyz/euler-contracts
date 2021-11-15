const { ChainId, Token, WETH, Fetcher, Trade, Route, TokenAmount, TradeType } = require('@uniswap/sdk');
const et = require("../euler-contracts/test/lib/eTestLib");

async function getExecutionPriceERC20(amount) {
    let celr = new Token(
        ChainId.MAINNET,
        '0x4F9254C83EB525f9FCf346490bbb3ed28a81C667',//address,
        18,//decimals,
        'CELR',//symbol,
        'CelerToken'//name,
    )
    
    let cvx = new Token(
        ChainId.MAINNET,
        '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',//address,
        18,//decimals,
        'CVX',//symbol,
        'Convex Finance'//name,
    )

    let usdc = new Token(
        ChainId.MAINNET,
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',//address,
        6,//decimals,
        'USDC',//symbol,
        'USD Coin'//name,
    )

    let lusd = new Token(
        ChainId.MAINNET,
        '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0',//address,
        18,//decimals,
        'LUSD',//symbol,
        'LUSD Stablecoin'//name,
    )

    let erc20token = lusd

    try {
        // https://docs.uniswap.org/sdk/2.0.0/guides/pricing
        const pair = await Fetcher.fetchPairData(erc20token, WETH[erc20token.chainId])
        const route = new Route([pair], WETH[erc20token.chainId])
        const trade = new Trade(route, new TokenAmount(WETH[erc20token.chainId], amount), TradeType.EXACT_INPUT)
        console.log(route.midPrice.toSignificant(6))
        console.log(trade.nextMidPrice.toSignificant(6))
        console.log(trade.executionPrice.toSignificant(6));
        
    } catch (e) {
        console.error(e.message);
    }
}

getExecutionPriceERC20(et.eth('1'))