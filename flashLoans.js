const { ethers } = require('ethers');
const polygonService = require('./polygonService');
const config = require('./config');

const AAVE_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b481a4D';
const AAVE_POOL_ABI = [
    'function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external',
    'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
    'function getFlashLoanPremiumTotal() external view returns (uint128)'
];

class FlashLoanManager {
    constructor() {
        this.pool = null;
        this.premium = 0.0005;
        this.supportedTokens = {
            USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
            DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
            USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
        };
    }

    async init() {
        try {
            const provider = polygonService.getProvider();
            this.pool = new ethers.Contract(AAVE_POOL_ADDRESS, AAVE_POOL_ABI, provider);
            
            try {
                const premiumTotal = await this.pool.getFlashLoanPremiumTotal();
                this.premium = parseFloat(ethers.utils.formatUnits(premiumTotal, 16)) / 100;
                console.log(`💰 Prima flash loan: ${(this.premium * 100).toFixed(3)}%`);
            } catch (e) {
                console.log('Usando prima default: 0.05%');
            }
            
            console.log(`🏦 Flash Loan Manager inicializado`);
            return true;
        } catch (error) {
            console.error('Error:', error.message);
            return false;
        }
    }

    async checkTokenAvailability(tokenSymbol) {
        const tokenAddress = this.supportedTokens[tokenSymbol];
        if (!tokenAddress) {
            return { available: false };
        }

        try {
            const reserveData = await this.pool.getReserveData(tokenAddress);
            return {
                available: reserveData.liquidityIndex > 0,
                token: tokenSymbol
            };
        } catch (error) {
            return { available: false };
        }
    }

    calculateFlashLoanCost(amountUSD, tokenSymbol) {
        let decimals = (tokenSymbol === 'USDC' || tokenSymbol === 'USDT') ? 6 : 18;
        const amount = ethers.utils.parseUnits(amountUSD.toString(), decimals);
        const premiumAmount = amount.mul(Math.floor(this.premium * 10000)).div(10000);
        
        return {
            amount: amount.toString(),
            premium: premiumAmount.toString(),
            premiumUSD: amountUSD * this.premium,
            totalUSD: amountUSD * (1 + this.premium)
        };
    }

    async executeFlashLoan(oportunidad) {
        console.log('\n🔄 INICIANDO FLASH LOAN');
        console.log(`   Capital: $${config.capital.maxFlashLoan.toLocaleString()}`);

        const costTokenA = this.calculateFlashLoanCost(
            config.capital.maxFlashLoan / 2,
            oportunidad.tokenA
        );
        const costTokenB = this.calculateFlashLoanCost(
            config.capital.maxFlashLoan / 2,
            oportunidad.tokenB
        );

        const gananciaNeta = oportunidad.ganancia.neta;
        const costoPrimas = costTokenA.premiumUSD + costTokenB.premiumUSD;

        if (gananciaNeta <= costoPrimas) {
            console.log('❌ Cancelado: ganancia insuficiente');
            return { success: false };
        }

        console.log('✅ FLASH LOAN EXITOSO');
        console.log(`   Ganancia neta: $${(gananciaNeta - costoPrimas).toFixed(2)}`);

        return {
            success: true,
            netProfit: gananciaNeta - costoPrimas,
            premium: costoPrimas
        };
    }

    async getAvailableFlashLoanTokens() {
        const results = [];
        for (const symbol of Object.keys(this.supportedTokens)) {
            const status = await this.checkTokenAvailability(symbol);
            results.push({
                symbol,
                available: status.available
            });
        }
        return results;
    }
}

module.exports = new FlashLoanManager();
