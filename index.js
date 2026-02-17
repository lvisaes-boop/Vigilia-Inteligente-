require('dotenv').config();
const http = require('http');

console.log('🤖 Bot iniciado - versión mínima');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Vigilia - OK');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor en puerto ${PORT}`);
});

setInterval(() => {
    console.log(`[${new Date().toISOString()}] Bot activo`);
}, 60000);
