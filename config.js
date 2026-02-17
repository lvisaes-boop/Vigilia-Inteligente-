module.exports = {
    capital: {
        maxFlashLoan: 20000000,
        minProfit: 0.30
    },
    reglas: {
        noPerdidas: true
    },
    gas: {
        modoUltra: {
            activo: false,
            intervalo: 3000
        },
        modoNormal: {
            intervalo: 30000
        }
    },
    estrategias: {
        arbitrajePrecios: true
    }
};
