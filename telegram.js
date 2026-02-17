const axios = require('axios');

class TelegramNotifier {
    constructor() {
        this.token = process.env.TELEGRAM_TOKEN || '';
        this.chatId = process.env.TELEGRAM_CHAT_ID || '';
        this.activo = !!(this.token && this.chatId);
        
        if (this.activo) {
            console.log('📱 Telegram notificaciones ACTIVADAS');
        } else {
            console.log('📱 Telegram notificaciones DESACTIVADAS (falta token o chatId)');
        }
    }

    async sendMessage(mensaje) {
        if (!this.activo) return false;

        try {
            const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
            await axios.post(url, {
                chat_id: this.chatId,
                text: mensaje,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            return true;
        } catch (error) {
            console.error('❌ Error enviando Telegram:', error.message);
            return false;
        }
    }

    // Notificar oportunidad detectada
    async notificarOportunidad(op) {
        const mensaje = `
🎯 <b>OPORTUNIDAD DETECTADA</b>
📊 Par: ${op.tokenA}/${op.tokenB}
💵 Comprar: ${op.comprarEn} a $${op.precioCompra.toFixed(6)}
💰 Vender: ${op.venderEn} a $${op.precioVenta.toFixed(6)}
📈 Diferencial: ${((op.precioVenta - op.precioCompra) / op.precioCompra * 100).toFixed(2)}%
💎 Ganancia neta estimada: $${op.ganancia.neta.toFixed(2)}
🕐 ${new Date().toLocaleString()}
        `;
        await this.sendMessage(mensaje);
    }

    // Notificar ejecución exitosa
    async notificarEjecucion(op, resultado) {
        const mensaje = `
🚀 <b>FLASH LOAN EJECUTADO</b>
💰 Préstamo: $20,000,000
📊 Par: ${op.tokenA}/${op.tokenB}
💵 Compra: ${op.comprarEn}
💰 Venta: ${op.venderEn}
💎 <b>GANANCIA NETA: $${resultado.netProfit?.toFixed(2) || '0.00'}</b>
🔗 Tx: ${resultado.txHash || 'N/A'}
🕐 ${new Date().toLocaleString()}
        `;
        await this.sendMessage(mensaje);
    }

    // Notificar error
    async notificarError(error, contexto) {
        const mensaje = `
❌ <b>ERROR EN EL BOT</b>
📍 Contexto: ${contexto}
📄 Mensaje: ${error.message}
🕐 ${new Date().toLocaleString()}
        `;
        await this.sendMessage(mensaje);
    }
}

module.exports = new TelegramNotifier();
