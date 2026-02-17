require('dotenv').config();
const http = require('http');
const polygonService = require('./polygonService');
const config = require('./config');
const arbitraje = require('./arbitraje');
const flashLoan = require('./flashLoan');

let server;

async function startBot() {
    console.log('🤖 INICIANDO VIGILIA INTELIGENTE');
    console.log(`💰 Flash loan máximo: $${config.capital.maxFlashLoan.toLocaleString()}`);
    console.log(`📉 Ganancia mínima: $${config.capital.minProfit}`);
    
    try {
        await polygonService.connect();
        const info = await polygonService.getNetworkInfo();
        console.log('📊 RED POLYGON:', info);
        
        await arbitraje.init();
        await flashLoan.init();
        
        const intervalo = config.gas.modoUltra.activo ? 
            config.gas.modoUltra.intervalo : 
            config.gas.modoNormal.intervalo;
        
        setInterval(async () => {
            try {
                const block = await polygonService.getBlockNumber();
                console.log(`[${new Date().toISOString()}] Bloque: ${block}`);
                
                const oportunidades = await arbitraje.buscarOportunidades();
                const rentables = oportunidades.filter(o => o.ganancia.esRentable);
                
                if (rentables.length > 0) {
                    const result = await flashLoan.executeFlashLoan(rentables[0]);
                    if (result.success) {
                        console.log(`   Ganancia: $${result.netProfit.toFixed(2)}`);
                    }
                }
            } catch (err) {
                console.error(`Error: ${err.message}`);
            }
        }, intervalo);

    } catch (error) {
        console.error('❌ Error:', error.message);
        setTimeout(startBot, 10000);
        return;
    }

    if (!server) {
        server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            
            if (req.url === '/status') {
                const info = await polygonService.getNetworkInfo();
                res.end(JSON.stringify(info));
            }
            else if (req.url === '/arbitraje') {
                res.end(JSON.stringify(arbitraje.getEstadisticas()));
            }
            else if (req.url === '/flashloan') {
                const tokens = await flashLoan.getAvailableFlashLoanTokens();
                res.end(JSON.stringify({ tokens, premium: flashLoan.premium }));
            }
            else {
                res.end(JSON.stringify({ status: 'ok', message: 'Bot activo' }));
            }
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`✅ Servidor en puerto ${PORT}`);
        });
    }
}

startBot();
