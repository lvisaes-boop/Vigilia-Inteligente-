require('dotenv').config();
const http = require('http');
const polygonService = require('./polygonService');

const server = http.createServer(async (req, res) => {
    if (req.url === '/status') {
        try {
            const info = await polygonService.getNetworkInfo();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(info, null, 2));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('🤖 Bot Vigilia - Polygon Service Activo');
    }
});

const PORT = process.env.PORT || 3000;

async function startBot() {
    console.log('🤖 Iniciando bot - Conectando a Polygon...');
    
    try {
        // Conectar a Polygon
        await polygonService.connect();
        
        // Mostrar información de red
        const info = await polygonService.getNetworkInfo();
        console.log('📊 Red Polygon:', {
            bloque: info.blockNumber,
            gas: info.gasPrice + ' gwei',
            rpc: info.activeRpc
        });
        
        // Verificar cada 30 segundos
        setInterval(async () => {
            const block = await polygonService.getBlockNumber();
            console.log(`[${new Date().toISOString()}] Bloque actual: ${block}`);
        }, 30000);

    } catch (error) {
        console.error('❌ Error conectando a Polygon:', error.message);
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Servidor en puerto ${PORT}`);
        console.log(`🌐 Endpoint de estado: /status`);
    });
}

startBot();
