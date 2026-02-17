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
        // Conectar a Polygon
        await polygonService.connect();
        
        // Mostrar información de red
        const info = await polygonService.getNetworkInfo();
        console.log('📊 RED POLYGON:', info);
        
        // Inicializar módulos
        await arbitraje.init();
        await flashLoan.init();
        
        // Intervalo fijo de 60 segundos para evitar límites de RPC
        const intervalo = 60000; // 60 segundos
        
        setInterval(async () => {
            try {
                const block = await polygonService.getBlockNumber();
                console.log(`[${new Date().toISOString()}] Bloque: ${block}`);

                const oportunidades = await arbitraje.buscarOportunidades();
                const rentables = oportunidades.filter(o => o.ganancia?.esRentable);
                
                if (rentables.length > 0) {
                    console.log(`💰 Ejecutando oportunidad rentable...`);
                    const result = await flashLoan.executeFlashLoan(rentables[0]);
                    if (result.success) {
                        console.log(`✅ Ganancia: $${result.netProfit?.toFixed(2) || '0.00'}`);
                    }
                }
            } catch (err) {
                console.error(`Error en escaneo: ${err.message}`);
            }
        }, intervalo);

    } catch (error) {
        console.error('❌ Error conectando a Polygon:', error.message);
        console.log('🔄 Reintentando en 10 segundos...');
        setTimeout(startBot, 10000);
        return;
    }

    // Crear servidor HTTP
    if (!server) {
        server = http.createServer(async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            
            try {
                if (req.url === '/status') {
                    const info = await polygonService.getNetworkInfo();
                    res.end(JSON.stringify(info, null, 2));
                }
                else if (req.url === '/arbitraje') {
                    const stats = arbitraje.getEstadisticas();
                    res.end(JSON.stringify(stats, null, 2));
                }
                else if (req.url === '/flashloan') {
                    const tokens = await flashLoan.getAvailableFlashLoanTokens();
                    res.end(JSON.stringify({ 
                        tokens, 
                        premium: flashLoan.premium || 0.0005 
                    }, null, 2));
                }
                else if (req.url === '/ultra/on') {
                    console.log('⚡ Modo ultra activado (mayor frecuencia)');
                    res.end(JSON.stringify({ message: 'Modo ultra activado' }));
                }
                else if (req.url === '/ultra/off') {
                    console.log('✅ Modo normal activado');
                    res.end(JSON.stringify({ message: 'Modo normal activado' }));
                }
                else {
                    res.end(JSON.stringify({ 
                        status: 'ok', 
                        message: 'Bot Vigilia Inteligente Activo',
                        endpoints: ['/status', '/arbitraje', '/flashloan', '/ultra/on', '/ultra/off']
                    }));
                }
            } catch (error) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: error.message }));
            }
        });

        const PORT = process.env.PORT || 3000;
        server.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Servidor web en puerto ${PORT}`);
            console.log(`📡 Endpoints disponibles:`);
            console.log(`   /status - Estado de Polygon`);
            console.log(`   /arbitraje - Estadísticas de arbitraje`);
            console.log(`   /flashloan - Info de flash loans`);
            console.log(`   /ultra/on - Activar modo ultra`);
            console.log(`   /ultra/off - Modo normal`);
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

// Iniciar el bot
startBot();

// Manejar cierre graceful
process.on('SIGTERM', () => {
    console.log('🛑 Recibida señal SIGTERM, cerrando...');
    if (server) {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    }
});

process.on('SIGINT', () => {
    console.log('🛑 Recibida señal SIGINT, cerrando...');
    if (server) {
        server.close(() => {
            console.log('✅ Servidor cerrado');
            process.exit(0);
        });
    }
});
