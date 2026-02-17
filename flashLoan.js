const { ethers } = require('ethers');
const polygonService = require('./polygonService');
const config = require('./config');

// ===========================================
// DIRECCIONES OFICIALES DE POLYGON (VERIFICADAS)
// ===========================================
const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';      // AAVE V3 Pool
const QUICKSWAP_ROUTER = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff';    // QuickSwap Router
const SUSHISWAP_ROUTER = '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506';    // SushiSwap Router
const USDC = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';           // USDC (6 decimals)
const WMATIC = '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270';         // WMATIC (18 decimals)

// ABI mínimo para AAVE Pool (solo flashLoanSimple)
const AAVE_POOL_ABI = [
    'function flashLoanSimple(address receiverAddress, address asset, uint256 amount, bytes calldata params, uint16 referralCode) external'
];

class FlashLoanManager {
    constructor() {
        this.pool = null;
        this.signer = null;
        this.premium = 0.0005; // 0.05% (prima de AAVE)
    }

    /**
     * Inicializa el gestor de flash loans
     */
    async init() {
        try {
            const provider = polygonService.getProvider();
            const privateKey = process.env.PRIVATE_KEY;
            
            if (!privateKey) {
                throw new Error('❌ PRIVATE_KEY no encontrada en variables de entorno');
            }
            
            // Crear signer con la clave privada
            this.signer = new ethers.Wallet(privateKey, provider);
            
            // Verificar que la wallet tiene POL para gas
            const balance = await provider.getBalance(this.signer.address);
            const balancePOL = ethers.utils.formatEther(balance);
            console.log(`   👤 Wallet: ${this.signer.address}`);
            console.log(`   💰 Balance POL: ${balancePOL}`);
            
            if (parseFloat(balancePOL) < 1) {
                console.log('   ⚠️  Saldo bajo de POL. Necesitas al menos 1 POL para operar.');
            }
            
            // Conectar con el pool de AAVE
            this.pool = new ethers.Contract(AAVE_POOL, AAVE_POOL_ABI, this.signer);
            
            console.log('\n🏦 FLASH LOAN MANAGER INICIALIZADO');
            console.log(`   📍 Pool AAVE: ${AAVE_POOL}`);
            console.log(`   💰 Préstamo máximo: $${(config.capital.maxFlashLoan / 1e6).toFixed(2)}M`);
            console.log(`   💸 Prima: ${this.premium * 100}% ($${config.capital.maxFlashLoan * this.premium} por operación)`);
            console.log(`   🔑 Wallet lista para firmar\n`);
            
            return true;
        } catch (error) {
            console.error('❌ Error inicializando flash loan:', error.message);
            return false;
        }
    }

    /**
     * Ejecuta un flash loan real en AAVE
     */
    async executeFlashLoan(oportunidad) {
        console.log('\n🔄 ==========================================');
        console.log('🔄 INICIANDO FLASH LOAN REAL EN AAVE');
        console.log('🔄 ==========================================');
        console.log(`   📊 Par: ${oportunidad.tokenA}/${oportunidad.tokenB}`);
        console.log(`   💵 Comprar en: ${oportunidad.comprarEn}`);
        console.log(`   💰 Vender en: ${oportunidad.venderEn}`);
        console.log(`   💎 Ganancia esperada: $${oportunidad.ganancia.neta.toFixed(2)}`);
        
        try {
            // Asegurar que el pool está inicializado
            if (!this.pool) {
                await this.init();
            }

            // 1. Preparar la cantidad (USDC tiene 6 decimales)
            const cantidad = ethers.utils.parseUnits(
                config.capital.maxFlashLoan.toString(), 
                6 // USDC decimals
            );
            
            // 2. Calcular la prima (0.05% del préstamo)
            const prima = cantidad.mul(5).div(10000); // 0.05% = 5/10000
            
            console.log(`   💰 Cantidad: $${ethers.utils.formatUnits(cantidad, 6)} USDC`);
            console.log(`   💸 Prima AAVE: $${ethers.utils.formatUnits(prima, 6)} USDC`);

            // 3. Codificar parámetros
            const params = ethers.utils.defaultAbiCoder.encode(
                ['address', 'address', 'address', 'address'],
                [
                    oportunidad.comprarEn === 'QuickSwap' ? QUICKSWAP_ROUTER : SUSHISWAP_ROUTER,
                    oportunidad.venderEn === 'QuickSwap' ? QUICKSWAP_ROUTER : SUSHISWAP_ROUTER,
                    oportunidad.tokenA === 'WMATIC' ? WMATIC : USDC,
                    oportunidad.tokenB === 'USDC' ? USDC : WMATIC
                ]
            );

            // 4. Estimar gas
            const gasPrice = await polygonService.getProvider().getGasPrice();
            const gasPriceGwei = ethers.utils.formatUnits(gasPrice, 'gwei');
            const gasCost = gasPrice.mul(500000); // ~500k gas estimado
            const gasCostPOL = ethers.utils.formatEther(gasCost);
            
            console.log(`   ⛽ Gas price: ${gasPriceGwei} gwei`);
            console.log(`   ⛽ Gas estimado: 500,000`);
            console.log(`   ⛽ Costo gas estimado: ${gasCostPOL} POL (~$${(parseFloat(gasCostPOL) * 0.5).toFixed(2)})`);

            // 5. Ejecutar el flash loan
            console.log(`   📤 Enviando transacción a AAVE...`);
            
            const tx = await this.pool.flashLoanSimple(
                this.signer.address, // receiver
                USDC,                // asset
                cantidad,            // amount
                params,              // params
                0                    // referral code
            );

            console.log(`   🔗 Hash: ${tx.hash}`);
            console.log(`   ⏳ Esperando confirmación...`);

            // 6. Esperar confirmación
            const receipt = await tx.wait();
            
            console.log(`   ✅ FLASH LOAN EJECUTADO EN BLOQUE: ${receipt.blockNumber}`);
            console.log(`   ⛽ Gas usado: ${receipt.gasUsed.toString()}`);
            
            // Buscar transferencias a owner (ganancias)
            let profitReal = oportunidad.ganancia.neta;
            
            // Analizar logs para encontrar la ganancia real
            for (const log of receipt.logs) {
                try {
                    if (log.address.toLowerCase() === USDC.toLowerCase()) {
                        // Es un evento de USDC, probablemente transferencia
                        console.log(`   💰 Transferencia de USDC detectada`);
                    }
                } catch (e) {}
            }
            
            console.log(`   💎 GANANCIA ESTIMADA: $${profitReal.toFixed(2)}`);
            console.log('🔄 ==========================================\n');

            return {
                success: true,
                txHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                profit: profitReal
            };

        } catch (error) {
            console.error('\n❌ ERROR EN FLASH LOAN:');
            console.error(`   ${error.message}`);
            
            // Análisis de errores comunes
            if (error.message.includes('insufficient funds')) {
                console.error('\n   ⚠️  No tienes suficiente POL para pagar el gas');
                console.error('   💡 Necesitas al menos 1 POL en tu wallet');
            } else if (error.message.includes('user rejected')) {
                console.error('\n   ⚠️  Transacción rechazada desde MetaMask');
            } else if (error.message.includes('nonce')) {
                console.error('\n   ⚠️  Error de nonce. Intenta de nuevo en unos segundos');
            } else if (error.message.includes('gas required exceeds')) {
                console.error('\n   ⚠️  Gas muy alto. Intenta más tarde');
            }
            
            console.log('🔄 ==========================================\n');
            
            return { 
                success: false, 
                error: error.message
            };
        }
    }

    /**
     * Simula un flash loan (sin ejecutarlo)
     */
    simulateFlashLoan(oportunidad) {
        const cantidad = config.capital.maxFlashLoan;
        const prima = cantidad * this.premium;
        const gananciaNeta = oportunidad.ganancia.neta - prima;
        
        return {
            amount: cantidad,
            premium: prima,
            netProfit: gananciaNeta,
            isProfitable: gananciaNeta >= config.capital.minProfit,
            gasEstimated: '0.05 POL (~$0.025)'
        };
    }

    /**
     * Obtiene el estado del gestor
     */
    async getStatus() {
        const provider = polygonService.getProvider();
        const balance = await provider.getBalance(this.signer?.address || '0x');
        
        return {
            initialized: !!this.pool,
            wallet: this.signer?.address || 'No configurada',
            balancePOL: parseFloat(ethers.utils.formatEther(balance)),
            maxFlashLoan: config.capital.maxFlashLoan,
            premium: this.premium,
            premiumUSD: config.capital.maxFlashLoan * this.premium
        };
    }
}

module.exports = new FlashLoanManager();
