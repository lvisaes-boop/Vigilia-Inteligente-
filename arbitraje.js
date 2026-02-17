const { ethers } = require('ethers');
const polygonService = require('./polygonService');
const config = require('./config');

const UNISWAP_V2_ABI = [
    'function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'
];

const DEXES = [
    {
        name: 'QuickSwap',
        router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
    },
    {
        name: 'SushiSwap',
        router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'
    }
];

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
    }
};

class Arbitraje {
    constructor() {
        this.provider = null;
        this.contracts = {};
        this.ultimaOportunidad = null;
    }

    async init() {
        this.provider = polygonService.getProvider();
        for (const dex of DEXES) {
            this.contracts[dex.name] = new ethers.Contract(
                dex.router,
                UNISWAP_V2_ABI,
                this.provider
            );
        }
        console.log(`📡 Monitoreando ${DEXES.length} DEXs en Polygon`);
        return true;
    }

    async getPrice(dexName, tokenIn, tokenOut, amountIn) {
        try {
            const contract = this.contracts[dexName];
            if (!contract) return null;

            const path = [tokenIn.address, tokenOut.address];
            const amounts = await contract.getAmountsOut(
                ethers.utils.parseUnits(amountIn.toString(), tokenIn.decimals),
                path
            );

            return parseFloat(ethers.utils.formatUnits(
                amounts[amounts.length - 1],
                tokenOut.decimals
            ));
        } catch (error) {
            return null;
        }
    }

    calcularGananciaNeta(precioCompra, precioVenta, cantidad, gasPrice) {
        const gananciaBruta = (precioVenta - precioCompra) * cantidad;
        const costoGas = (gasPrice * 300000) / 1e9 * 1500;
        const gananciaNeta = gananciaBruta - costoGas;
        
        return {
            bruta: gananciaBruta,
            gas: costoGas,
            neta: gananciaNeta,
            esRentable: gananciaNeta >= config.capital.minProfit
        };
    }

    async buscarOportunidades() {
        if (!this.provider) await this.init();

        const oportunidades = [];
        const gasPrice = parseFloat(await polygonService.getGasPrice() || 100);
        const tokensList = Object.values(TOKENS);

        for (let i = 0; i < tokensList.length; i++) {
            for (let j = i + 1; j < tokensList.length; j++) {
                const tokenA = tokensList[i];
                const tokenB = tokensList[j];
                
                const precios = {};
                for (const dex of DEXES) {
                    const precio = await this.getPrice(dex.name, tokenA, tokenB, 1);
                    if (precio) precios[dex.name] = precio;
                }

                if (Object.keys(precios).length >= 2) {
                    let dexBarato = null, dexCaro = null;
                    let precioBarato = Infinity, precioCaro = -Infinity;

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
                            precioBarato, precioCaro, 1000, gasPrice
                        );

                        const oportunidad = {
                            id: `OP-${Date.now()}`,
                            tokenA: tokenA.symbol,
                            tokenB: tokenB.symbol,
                            comprarEn: dexBarato,
                            venderEn: dexCaro,
                            precioCompra: precioBarato,
                            precioVenta: precioCaro,
                            ganancia: ganancia
                        };

                        oportunidades.push(oportunidad);

                        if (ganancia.esRentable) {
                            console.log(`💰 Oportunidad: ${tokenA.symbol}/${tokenB.symbol} - Ganancia: $${ganancia.neta.toFixed(2)}`);
                            this.ultimaOportunidad = oportunidad;
                        }
                    }
                }
            }
        }
        return oportunidades;
    }

    getEstadisticas() {
        return {
            ultimaOportunidad: this.ultimaOportunidad,
            minProfit: config.capital.minProfit
        };
    }
}

module.exports = new Arbitraje();
