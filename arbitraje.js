const { ethers } = require('ethers');
const polygonService = require('./polygonService');
const config = require('./config');

// ABIs mínimos para interactuar con DEX
const UNISWAP_V2_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)'
];

// DEXs en Polygon
const DEXES = [
    {
        name: 'QuickSwap',
        router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
        factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
        abi: UNISWAP_V2_ABI
    },
    {
        name: 'SushiSwap',
        router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
        factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
        abi: UNISWAP_V2_ABI
    }
];

// Tokens a monitorear
const TOKENS = {
    WMATIC: {
        address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
        decimals: 18,
        symbol: 'WMATIC'
    },
    USDC: {
        address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        decimals: 6,
        symbol: 'USDC'
    },
    WETH: {
        address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
        decimals: 18,
        symbol: 'WETH'
    }
};

class Arbitraje {
    constructor() {
        this.provider = null;
        this.contracts = {};
        this.ultimaOportunidad = null;
    }

    // Inicializar contratos de los DEX
    async init() {
        this.provider = polygonService.getProvider();
        
        for (const dex of DEXES) {
            this.contracts[dex.name] = new ethers.Contract(
                dex.router,
                dex.abi,
                this.provider
            );
        }
        
        console.log(`📡 Monitoreando ${DEXES.length} DEXs en Polygon`);
    }

    // Obtener precio de un par en un DEX específico
    async getPrice(dexName, tokenIn, tokenOut, amountIn) {
        try {
            const contract = this.contracts[dexName];
            if (!contract) throw new Error(`DEX ${dexName} no encontrado`);

            const path = [tokenIn.address, tokenOut.address];
            const amounts = await contract.getAmountsOut(
                ethers.utils.parseUnits(amountIn.toString(), tokenIn.decimals),
                path
            );

            const amountOut = ethers.utils.formatUnits(
                amounts[amounts.length - 1],
                tokenOut.decimals
            );

            return parseFloat(amountOut);
        } catch (error) {
            console.log(`Error obteniendo precio en ${dexName}: ${error.message}`);
            return null;
        }
    }

    // Calcular ganancia neta después de gas
    calcularGananciaNeta(precioCompra, precioVenta, cantidad, gasPrice) {
        const gananciaBruta = (precioVenta - precioCompra) * cantidad;
        const costoGas = (gasPrice * 300000) / 1e9; // 300k gas * gasPrice en gwei / 1e9 = ETH
        const costoGasUSD = costoGas * 1500; // Asumiendo ETH a $1500 (ajustar)
        
        const gananciaNeta = gananciaBruta - costoGasUSD;
        
        return {
            bruta: gananciaBruta,
            gas: costoGasUSD,
            neta: gananciaNeta,
            esRentable: gananciaNeta >= config.capital.minProfit
        };
    }

    // Buscar oportunidades de arbitraje
    async buscarOportunidades() {
        if (!this.provider) await this.init();

        const oportunidades = [];
        const gasPrice = await polygonService.getGasPrice();
        const gasPriceNum = parseFloat(gasPrice);

        // Probar cada par de tokens
        const tokensList = Object.values(TOKENS);
        
        for (let i = 0; i < tokensList.length; i++) {
            for (let j = i + 1; j < tokensList.length; j++) {
                const tokenA = tokensList[i];
                const tokenB = tokensList[j];
                
                // Cantidad base: 1 token A
                const cantidadBase = 1;

                // Obtener precios en cada DEX
                const precios = {};
                for (const dex of DEXES) {
                    const precio = await this.getPrice(
                        dex.name,
                        tokenA,
                        tokenB,
                        cantidadBase
                    );
                    if (precio) {
                        precios[dex.name] = precio;
                    }
                }

                // Buscar el DEX más barato para comprar y el más caro para vender
                if (Object.keys(precios).length >= 2) {
                    let dexBarato = null;
                    let dexCaro = null;
                    let precioBarato = Infinity;
                    let precioCaro = -Infinity;

                    for (const [dexName, precio] of Object.entries(precios)) {
                        if (precio < precioBarato) {
                            precioBarato = precio;
                            dexBarato = dexName;
                        }
                        if (precio > precioCaro) {
                            precioCaro = precio;
                            dexCaro = dexName;
                        }
                    }

                    if (dexBarato !== dexCaro && precioCaro > precioBarato) {
                        const ganancia = this.calcularGananciaNeta(
                            precioBarato,
                            precioCaro,
                            cantidadBase * 1000, // Escalar a cantidad significativa
                            gasPriceNum
                        );

                        const oportunidad = {
                            id: `OP-${Date.now()}-${i}-${j}`,
                            timestamp: new Date().toISOString(),
                            tokenA: tokenA.symbol,
                            tokenB: tokenB.symbol,
                            comprarEn: dexBarato,
                            venderEn: dexCaro,
                            precioCompra: precioBarato,
                            precioVenta: precioCaro,
                            diferencial: ((precioCaro - precioBarato) / precioBarato * 100).toFixed(2) + '%',
                            cantidad: cantidadBase * 1000,
                            ganancia: ganancia,
                            gasPrice: gasPriceNum
                        };

                        oportunidades.push(oportunidad);

                        // Log si es rentable
                        if (ganancia.esRentable) {
                            console.log('💰 OPORTUNIDAD RENTABLE ENCONTRADA:');
                            console.log(`   ${tokenA.symbol}/${tokenB.symbol}: Comprar en ${dexBarato} a $${precioBarato.toFixed(6)}, vender en ${dexCaro} a $${precioCaro.toFixed(6)}`);
                            console.log(`   Ganancia neta: $${ganancia.neta.toFixed(2)}`);
                            this.ultimaOportunidad = oportunidad;
                        }
                    }
                }
            }
        }

        return oportunidades;
    }

    // Ejecutar una oportunidad (simulado por ahora)
    async ejecutarOportunidad(oportunidad) {
        console.log('🚀 EJECUTANDO OPORTUNIDAD:');
        console.log(`   ID: ${oportunidad.id}`);
        console.log(`   Par: ${oportunidad.tokenA}/${oportunidad.tokenB}`);
        console.log(`   Comprar: ${oportunidad.comprarEn} a $${oportunidad.precioCompra}`);
        console.log(`   Vender: ${oportunidad.venderEn} a $${oportunidad.precioVenta}`);
        console.log(`   Ganancia neta: $${oportunidad.ganancia.neta.toFixed(2)}`);
        
        // Aquí iría la lógica real de ejecución con flash loan
        // Por ahora solo simulamos éxito
        
        return {
            success: true,
            txHash: '0x' + '0'.repeat(64),
            profit: oportunidad.ganancia.neta,
            timestamp: new Date().toISOString()
        };
    }

    // Obtener estadísticas
    getEstadisticas() {
        return {
            dexesMonitoreados: DEXES.length,
            tokensMonitoreados: Object.keys(TOKENS).length,
            ultimaOportunidad: this.ultimaOportunidad,
            config: {
                minProfit: config.capital.minProfit,
                maxFlashLoan: config.capital.maxFlashLoan
            }
        };
    }
}

module.exports = new Arbitraje();
