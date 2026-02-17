require('dotenv').config();
const http = require('http');
const polygonService = require('./polygonService');
const arbitraje = require('./arbitraje');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Vigilia Activo');
});

const PORT = process.env.PORT || 3000;

async function start() {
    console.log('🤖 Iniciando bot...');
    await polygonService.connect();
    await arbitraje.init();
    
    setInterval(async () => {
        await arbitraje.buscarOportunidades();
    }, 30000);

    server.listen(PORT, () => {
        console.log(`✅ Servidor en puerto ${PORT}`);
    });
}

start();
