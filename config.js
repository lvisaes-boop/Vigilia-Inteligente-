/**
 * Configuración del Bot de Arbitraje
 * Basado en los requisitos: $20M flash loan, ganancia mínima $0.30, cero pérdidas
 */

module.exports = {
    // ========== CAPITAL Y PRÉSTAMOS ==========
    capital: {
        maxFlashLoan: 20_000_000,     // $20 millones USD
        minProfit: 0.30,               // Ganancia mínima para operar ($0.30)
        maxGasPerProfit: 0.3,          // Máximo 30% de la ganancia en gas
        maxSlippage: 0.01,              // 1% máximo de deslizamiento
    },

    // ========== ESTRATEGIAS ACTIVAS ==========
    estrategias: {
        arbitrajePrecios: true,         // Comprar barato, vender caro
        marketMaker: false,              // Crear liquidez (desactivado por ahora)
        carryTrade: false,                // Arbitraje de tasas (desactivado)
        multicadena: false,               // Múltiples redes (desactivado)
    },

    // ========== REGLAS DE ORO ==========
    reglas: {
        noPerdidas: true,                // NUNCA operar con pérdida neta
        simularAntes: true,               // Simular antes de ejecutar
        soloContratosVerificados: true,    // Solo interactuar con contratos seguros
    },

    // ========== GAS Y VELOCIDAD ==========
    gas: {
        maxPrice: 500,                    // Máximo 500 gwei
        modoUltra: {
            activo: false,                 // Se activa manualmente
            multiplicador: 1.5,             // 50% más de gas en modo ultra
            intervalo: 3000,                // 3 segundos en modo ultra
        },
        modoNormal: {
            intervalo: 30000,                // 30 segundos entre escaneos
        }
    },

    // ========== COMPETENCIA Y MEV ==========
    competencia: {
        monitorearMempool: true,           // Ver qué hacen otros bots
        frontRunningDefensivo: true,        // Pagar más gas si es necesario
        umbralAdaptativo: [0.30, 0.10, 0.05], // Bajar umbral si hay competencia
    },

    // ========== SEGURIDAD ==========
    seguridad: {
        maxPorOperacion: 0.1,               // Máximo 10% del capital por operación
        detectarHoneypots: true,            // Evitar trampas
        soloDexPermitidos: [                 // DEXes confiables
            'QuickSwap',
            'SushiSwap',
            'Uniswap V3'
        ],
    },

    // ========== NOTIFICACIONES ==========
    notificaciones: {
        telegram: {
            activo: false,                   // Activar cuando tengas token
            cadaOperacion: true,
            alertasRiesgo: true,
        },
        console: true,                       // Mostrar en logs
    },

    // ========== REDES ==========
    redes: {
        polygon: {
            activo: true,
            chainId: 137,
            nombre: 'Polygon Mainnet',
        },
        ethereum: {
            activo: false,                    // Desactivado por ahora
            chainId: 1,
            nombre: 'Ethereum Mainnet',
        },
    },

    // ========== CONTRATOS (Polygon) ==========
    contratos: {
        quickSwap: {
            router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
            factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
        },
        tokens: {
            wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        }
    },

    // ========== VERSIÓN ==========
    version: '2.0.0-dios',
    fecha: new Date().toISOString(),
};
