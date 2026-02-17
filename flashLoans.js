const { ethers } = require('ethers');
const polygonService = require('./polygonService');
const config = require('./config');

// Dirección del contrato de AAVE V3 en Polygon
const AAVE_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

// ABI mínimo para flash loans
const AAVE_POOL_ABI = [
    'function flashLoan(address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] calldata interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode) external',
    'function getReserveData(address asset) external view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
    'function getFlashLoanPremiumTotal() external view returns (uint128)'
];

class FlashLoanManager {
    constructor() {
        this.pool = null;
        this.premium = 0.0005; // 0.05% default, se actualizará del contrato
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
            
            // Obtener la prima actual del flash loan (comisión)
            try {
                const premiumTotal = await this.pool.getFlashLoanPremiumTotal();
                this.premium = parseFloat(ethers.utils.formatUnits(premiumTotal, 16)) / 100; // Convertir a porcentaje
                console.log(`💰 Prima flash loan: ${(this.premium * 100).toFixed(3)}%`);
            } catch (e) {
                console.log('Usando prima default: 0.05%');
            }
            
            console.log(`🏦 Flash Loan Manager inicializado en AAVE V3`);
            console.log(`   Préstamo máximo: $${(config.capital.maxFlashLoan / 1e6).toFixed(2)}M`);
            return true;
        } catch (error) {
            console.error('Error inicializando Flash Loan Manager:', error.message);
            return false;
        }
    }

    // Verificar si un token está disponible para flash loan
    async checkTokenAvailability(tokenSymbol) {
        const tokenAddress = this.supportedTokens[tokenSymbol];
        if (!tokenAddress) {
            return { available: false, reason: 'Token no soportado' };
        }

        try {
            const reserveData = await this.pool.getReserveData(tokenAddress);
            // Verificar que la reserva esté activa (liquidityIndex > 0)
            const isActive = reserveData.liquidityIndex > 0;
            return {
                available: isActive,
                token: tokenSymbol,
                address: tokenAddress,
                liquidityIndex: reserveData.liquidityIndex.toString(),
                aTokenAddress: reserveData.aTokenAddress
            };
        } catch (error) {
            return { available: false, reason: 'Error consultando reserva' };
        }
    }

    // Calcular costo total del flash loan
    calculateFlashLoanCost(amountUSD, tokenSymbol) {
        // Ajustar por decimales del token
        let decimals = 6; // USDC, USDT tienen 6
        if (tokenSymbol === 'WMATIC' || tokenSymbol === 'WETH' || tokenSymbol === 'DAI') {
            decimals = 18;
        }

        const amount = ethers.utils.parseUnits(amountUSD.toString(), decimals);
        
        // Costo = cantidad + prima (0.05% generalmente)
        const premiumAmount = amount.mul(Math.floor(this.premium * 10000)).div(10000);
        const totalToRepay = amount.add(premiumAmount);

        return {
            amount: amount.toString(),
            premium: premiumAmount.toString(),
            totalToRepay: totalToRepay.toString(),
            premiumUSD: amountUSD * this.premium,
            totalUSD: amountUSD * (1 + this.premium)
        };
    }

    // Ejecutar flash loan (simulado por ahora - después será real con contrato)
    async executeFlashLoan(oportunidad) {
        console.log('\n🔄 INICIANDO FLASH LOAN');
        console.log(`   Capital solicitado: $${config.capital.maxFlashLoan.toLocaleString()}`);
        
        // Verificar disponibilidad de tokens
        const tokenChecks = await Promise.all([
            this.checkTokenAvailability(oportunidad.tokenA),
            this.checkTokenAvailability(oportunidad.tokenB)
        ]);

        console.log(`   Token ${oportunidad.tokenA}: ${tokenChecks[0].available ? '✅' : '❌'}`);
        console.log(`   Token ${oportunidad.tokenB}: ${tokenChecks[1].available ? '✅' : '❌'}`);

        if (!tokenChecks[0].available || !tokenChecks[1].available) {
            console.log('❌ Flash loan cancelado: tokens no disponibles');
            return { success: false, reason: 'Tokens no disponibles' };
        }

        // Calcular costos
        const costTokenA = this.calculateFlashLoanCost(
            config.capital.maxFlashLoan / 2, // Mitad en cada token
            oportunidad.tokenA
        );
        const costTokenB = this.calculateFlashLoanCost(
            config.capital.maxFlashLoan / 2,
            oportunidad.tokenB
        );

        console.log(`   Costo token ${oportunidad.tokenA}: $${costTokenA.totalUSD.toFixed(2)} (incluye prima $${costTokenA.premiumUSD.toFixed(2)})`);
        console.log(`   Costo token ${oportunidad.tokenB}: $${costTokenB.totalUSD.toFixed(2)} (incluye prima $${costTokenB.premiumUSD.toFixed(2)})`);

        // Verificar que la ganancia cubra el costo total
        const gananciaNeta = oportunidad.ganancia.neta;
        const costoTotalPrimas = costTokenA.premiumUSD + costTokenB.premiumUSD;

        console.log(`   Ganancia esperada: $${gananciaNeta.toFixed(2)}`);
        console.log(`   Costo primas: $${costoTotalPrimas.toFixed(2)}`);

        if (gananciaNeta <= costoTotalPrimas) {
            console.log('❌ Flash loan cancelado: ganancia no cubre primas');
            return { 
                success: false, 
                reason: 'Ganancia insuficiente para cubrir primas',
                netoDespuesPrimas: gananciaNeta - costoTotalPrimas
            };
        }

        // Simular ejecución exitosa
        console.log('✅ FLASH LOAN EJECUTADO EXITOSAMENTE');
        console.log(`   Ganancia neta después de primas: $${(gananciaNeta - costoTotalPrimas).toFixed(2)}`);

        return {
            success: true,
            txHash: '0x' + 'f'.repeat(64),
            amount: config.capital.maxFlashLoan,
            premium: costoTotalPrimas,
            netProfit: gananciaNeta - costoTotalPrimas,
            timestamp: new Date().toISOString()
        };
    }

    // Obtener estadísticas de flash loans disponibles
    async getAvailableFlashLoanTokens() {
        const results = [];
        for (const [symbol, address] of Object.entries(this.supportedTokens)) {
            const status = await this.checkTokenAvailability(symbol);
            results.push({
                symbol,
                address,
                available: status.available,
                aTokenAddress: status.aTokenAddress || 'N/A'
            });
        }
        return results;
    }
}

module.exports = new FlashLoanManager();
