require('dotenv').config();
const http = require('http');
const polygonService = require('./polygonService');
const config = require('./config');
const arbitraje = require('./arbitraje');
const flashLoan = require('./flashLoan');
const telegram = require('./telegram');

let server;

async function startBot() {
    console.log('🤖 INICIANDO VIGILIA INTELIGENTE');
    console.log(`💰 Flash loan máximo: $${config.capital.maxFlashLoan.toLocaleString()}`);
    console.log(`📉 Ganancia mínima: $${config.capital.minProfit}`);
    
    // Notificar inicio por Telegram
    await telegram.sendMessage(`
🤖 <b>VIGILIA INTELIGENTE INICIADO</b>
💰 Flash loan: $${config.capital.maxFlashLoan.toLocaleString()}
📉 Mínimo: $${config.capital.minProfit}
🌐 Red: Polygon Mainnet
⚡ Modo: ${config.gas.modoUltra.activo ? 'ULTRA' : 'NORMAL'}
    `);
    
    try {
        // Conectar a Polygon
        await polygonService.connect();
        
        // Mostrar información de red
        const info = await polygonService.getNetworkInfo();
        console.log('📊 RED POLYGON:', info);
        
        // Inicializar módulos
        await arbitraje.init();
        await flashLoan.init();
        
        // Intervalo fijo de 60 segundos
        const intervalo = 60000; // 60 segundos
        
        setInterval(async () => {
            try {
                const block = await polygonService.getBlockNumber();
                console.log(`[${new Date().toISOString()}] Bloque: ${block}`);

                const oportunidades = await arbitraje.buscarOportunidades();
                const rentables = oportunidades.filter(o => o.ganancia?.esRentable);
                
                if (rentables.length > 0) {
                    // Notificar oportunidad detectada
                    await telegram.sendMessage(`
🎯 <b>OPORTUNIDAD DETECTADA</b>
📊 Par: ${rentables[0].tokenA}/${rentables[0].tokenB}
💵 Comprar: ${rentables[0].comprarEn} a $${rentables[0].precioCompra.toFixed(6)}
💰 Vender: ${rentables[0].venderEn} a $${rentables[0].precioVenta.toFixed(6)}
💎 Ganancia neta: $${rentables[0].ganancia.neta.toFixed(2)}
                    `);
                    
                    console.log(`💰 Ejecutando oportunidad rentable...`);
                    const result = await flashLoan.executeFlashLoan(rentables[0]);
                    
                    if (result.success) {
                        console.log(`✅ Ganancia: $${result.netProfit?.toFixed(2) || '0.00'}`);
                        
                        // Notificar ejecución exitosa
                        await telegram.sendMessage(`
🚀 <b>FLASH LOAN EJECUTADO</b>
💰 Préstamo: $20,000,000
📊 Par: ${rentables[0].tokenA}/${rentables[0].tokenB}
💎 <b>GANANCIA: $${result.netProfit?.toFixed(2) || '0.00'}</b>
🔗 Tx: ${result.txHash || 'N/A'}
                        `);
                    } else {
                        // Notificar error en ejecución
                        await telegram.sendMessage(`
❌ <b>ERROR EN FLASH LOAN</b>
📊 Par: ${rentables[0].tokenA}/${rentables[0].tokenB}
📄 Error: ${result.error || 'Desconocido'}
                        `);
                    }
                }
            } catch (err) {
                console.error(`Error en escaneo: ${err.message}`);
                await telegram.sendMessage(`
⚠️ <b>ERROR EN ESCANEO</b>
📄 ${err.message}
                `);
            }
        }, intervalo);

    } catch (error) {
        console.error('❌ Error conectando a Polygon:', error.message);
        await telegram.sendMessage(`
❌ <b>ERROR CONECTANDO A POLYGON</b>
📄 ${error.message}
🔄 Reintentando en 10 segundos...
        `);
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
                    config.gas.modoUltra.activo = true;
                    console.log('⚡ Modo ultra activado');
                    await telegram.sendMessage('⚡ <b>MODO ULTRA ACTIVADO</b>');
                    res.end(JSON.stringify({ message: 'Modo ultra activado' }));
                }
                else if (req.url === '/ultra/off') {
                    config.gas.modoUltra.activo = false;
                    console.log('✅ Modo normal activado');
                    await telegram.sendMessage('✅ <b>MODO NORMAL ACTIVADO</b>');
                    res.end(JSON.stringify({ message: 'Modo normal activado' }));
                }
                else if (req.url === '/test-telegram') {
                    await telegram.sendMessage('🧪 <b>PRUEBA DE TELEGRAM</b>\nSi ves esto, las notificaciones funcionan correctamente.');
                    res.end(JSON.stringify({ message: 'Mensaje de prueba enviado' }));
                }
                else {
                    res.end(JSON.stringify({ 
                        status: 'ok', 
                        message: 'Bot Vigilia Inteligente Activo',
                        endpoints: ['/status', '/arbitraje', '/flashloan', '/ultra/on', '/ultra/off', '/test-telegram']
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
            console.log(`   /test-telegram - Probar Telegram`);
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
