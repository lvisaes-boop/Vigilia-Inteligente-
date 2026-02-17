require('dotenv').config();
const http = require('http');
const polygonService = require('./polygonService');
const config = require('./config');
const arbitraje = require('./arbitraje');

let server;

async function startBot() {
    console.log('🤖 INICIANDO VIGILIA INTELIGENTE - MODO DIOS');
    console.log('📋 CONFIGURACIÓN:');
    console.log(`   💰 Flash loan máximo: $${config.capital.maxFlashLoan.toLocaleString()}`);
    console.log(`   📉 Ganancia mínima: $${config.capital.minProfit}`);
    console.log(`   🔒 Regla de no pérdidas: ${config.reglas.noPerdidas ? 'ACTIVA' : 'INACTIVA'}`);
    console.log(`   ⚡ Estrategias: ${Object.entries(config.estrategias).filter(([,v]) => v).map(([k]) => k).join(', ')}`);
    
    try {
        // Conectar a Polygon
        await polygonService.connect();
        
        // Mostrar información de red
        const info = await polygonService.getNetworkInfo();
        console.log('📊 RED POLYGON:');
        console.log(`   🌐 Red: ${info.name} (Chain ID: ${info.chainId})`);
        console.log(`   📦 Bloque actual: ${info.blockNumber}`);
        console.log(`   ⛽ Gas price: ${info.gasPrice} gwei`);
        console.log(`   🔌 RPC activo: ${info.activeRpc}`);
        
        // Inicializar arbitraje
        await arbitraje.init();
        
        // Verificar cada 30 segundos (modo normal) o 3 segundos (ultra)
        const intervalo = config.gas.modoUltra.activo ? 
            config.gas.modoUltra.intervalo : 
            config.gas.modoNormal.intervalo;
        
        setInterval(async () => {
            try {
                const block = await polygonService.getBlockNumber();
                const gasPrice = await polygonService.getGasPrice() || 'N/A';
                console.log(`[${new Date().toISOString()}] 📦 Bloque: ${block} | ⛽ Gas: ${gasPrice} gwei`);
                
                // Buscar oportunidades de arbitraje
                const oportunidades = await arbitraje.buscarOportunidades();
                if (oportunidades.length > 0) {
                    const rentables = oportunidades.filter(o => o.ganancia.esRentable);
                    if (rentables.length > 0) {
                        console.log(`💰 Se encontraron ${rentables.length} oportunidades rentables`);
                        // Ejecutar la mejor
                        await arbitraje.ejecutarOportunidad(rentables[0]);
                    }
                }
            } catch (err) {
                console.error(`Error en escaneo: ${err.message}`);
            }
        }, intervalo);

    } catch (error) {
        console.error('❌ ERROR CONECTANDO A POLYGON:', error.message);
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(startBot, 10000);
        return;
    }

    // Crear servidor HTTP
    if (!server) {
        server = http.createServer(async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            if (req.url === '/status') {
                try {
                    const info = await polygonService.getNetworkInfo();
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        ...info,
                        config: {
                            maxFlashLoan: config.capital.maxFlashLoan,
                            minProfit: config.capital.minProfit,
                            estrategias: config.estrategias,
                            reglas: config.reglas
                        },
                        timestamp: new Date().toISOString()
                    }, null, 2));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }));
                }
            } 
            else if (req.url === '/ultra/on') {
                config.gas.modoUltra.activo = true;
                console.log('⚡ MODO ULTRA ACTIVADO');
                res.end('⚡ Modo ultra activado - Escaneo cada 3 segundos');
            }
            else if (req.url === '/ultra/off') {
                config.gas.modoUltra.activo = false;
                console.log('✅ MODO NORMAL ACTIVADO');
                res.end('✅ Modo normal activado - Escaneo cada 30 segundos');
            }
            else if (req.url === '/config') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(config, null, 2));
            }
            else if (req.url === '/arbitraje') {
                const stats = arbitraje.getEstadisticas();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(stats, null, 2));
            }
            else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Vigilia Inteligente - Bot Dios</title>
                        <style>
                            body { font-family: Arial; background: #0a0a0a; color: #00ff00; padding: 20px; }
                            h1 { color: #00ff00; border-bottom: 1px solid #00ff00; }
                            .info { background: #1a1a1a; padding: 15px; border-radius: 5px; margin: 10px 0; }
                            .endpoint { color: #ffff00; }
                            .value { color: #00ffff; }
                        </style>
                    </head>
                    <body>
                        <h1>🐉 VIGILIA INTELIGENTE - MODO DIOS</h1>
                        <div class="info">
                            <p>💰 <strong>Flash loan máximo:</strong> <span class="value">$${config.capital.maxFlashLoan.toLocaleString()}</span></p>
                            <p>📉 <strong>Ganancia mínima:</strong> <span class="value">$${config.capital.minProfit}</span></p>
                            <p>🔒 <strong>Regla de no pérdidas:</strong> <span class="value">${config.reglas.noPerdidas ? 'ACTIVA' : 'INACTIVA'}</span></p>
                            <p>⚡ <strong>Modo actual:</strong> <span class="value">${config.gas.modoUltra.activo ? 'ULTRA' : 'NORMAL'}</span></p>
                        </div>
                        <div class="info">
                            <p><strong>📡 ENDPOINTS DISPONIBLES:</strong></p>
                            <p>🔹 <span class="endpoint">/status</span> - Estado completo del bot y red</p>
                            <p>🔹 <span class="endpoint">/ultra/on</span> - Activar modo ultra (escaneo cada 3s)</p>
                            <p>🔹 <span class="endpoint">/ultra/off</span> - Volver a modo normal (30s)</p>
                            <p>🔹 <span class="endpoint">/config</span> - Ver configuración actual</p>
                            <p>🔹 <span class="endpoint">/arbitraje</span> - Ver estadísticas de arbitraje</p>
                        </div>
                        <div class="info">
                            <p>⛓️ <strong>Conectado a:</strong> Polygon Mainnet (Chain ID: 137)</p>
                            <p>🕒 <strong>Server time:</strong> ${new Date().toISOString()}</p>
                        </div>
                    </body>
                    </html>
                `);
            }
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ SERVIDOR WEB EN PUERTO ${PORT}`);
            console.log(`🌐 ENDPOINTS:`);
            console.log(`   📊 /status - Estado completo`);
            console.log(`   ⚡ /ultra/on - Activar modo ultra`);
            console.log(`   🔧 /ultra/off - Modo normal`);
            console.log(`   ⚙️ /config - Ver configuración`);
            console.log(`   📈 /arbitraje - Estadísticas de arbitraje`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`❌ Puerto ${PORT} en uso, intentando con otro...`);
                server.listen(0, '0.0.0.0');
            } else {
                console.error('Error del servidor:', err);
            }
        });
    }
}

startBot();

process.on('SIGTERM', () => {
    console.log('🛑 Recibida señal SIGTERM, cerrando gracefulmente...');
    if (server) {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    }
});

process.on('SIGINT', () => {
    console.log('🛑 Recibida señal SIGINT, cerrando gracefulmente...');
    if (server) {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    }
});
