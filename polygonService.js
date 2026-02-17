const { ethers } = require('ethers');

/**
 * Servicio de conexión a Polygon
 * Maneja múltiples RPCs, timeouts y reintentos
 */
class PolygonService {
    constructor() {
        // Lista de RPCs de Polygon (en orden de preferencia)
        this.rpcUrls = [
            'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon-bor-rpc.publicnode.com',
            'https://polygon.llamarpc.com'
        ];
        
        this.currentRpcIndex = 0;
        this.provider = null;
        this.chainId = 137; // Polygon Mainnet
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    /**
     * Inicializa el proveedor con el RPC actual
     */
    async connect() {
        const rpcUrl = this.rpcUrls[this.currentRpcIndex];
        console.log(`🔄 Conectando a Polygon usando: ${rpcUrl}`);

        try {
            // Crear proveedor con timeout
            this.provider = new ethers.providers.JsonRpcProvider({
                url: rpcUrl,
                timeout: 15000 // 15 segundos
            });

            // Verificar conexión obteniendo el block number y chainId
            const [blockNumber, network] = await Promise.all([
                this.provider.getBlockNumber(),
                this.provider.getNetwork()
            ]);

            // Verificar que sea Polygon (chainId 137)
            if (network.chainId !== this.chainId) {
                throw new Error(`ChainId incorrecto: esperado ${this.chainId}, obtenido ${network.chainId}`);
            }

            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            console.log(`✅ Conectado a Polygon - Bloque actual: ${blockNumber}`);
            console.log(`🌐 Red: ${network.name} (Chain ID: ${network.chainId})`);
            
            return true;

        } catch (error) {
            console.error(`❌ Error conectando a ${rpcUrl}: ${error.message}`);
            this.isConnected = false;
            
            // Intentar con el siguiente RPC
            return await this.failover();
        }
    }

    /**
     * Cambia al siguiente RPC si hay error
     */
    async failover() {
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
            throw new Error(`No se pudo conectar después de ${this.maxReconnectAttempts} intentos`);
        }

        // Cambiar al siguiente RPC (round-robin)
        this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
        
        console.log(`🔄 Intentando con RPC alternativo (intento ${this.reconnectAttempts})...`);
        
        // Esperar 2 segundos antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return this.connect();
    }

    /**
     * Obtiene el proveedor activo
     */
    getProvider() {
        if (!this.isConnected || !this.provider) {
            throw new Error('No hay conexión activa. Llama a connect() primero.');
        }
        return this.provider;
    }

    /**
     * Verifica el estado de la conexión
     */
    async checkHealth() {
        try {
            if (!this.provider) return false;
            
            const blockNumber = await this.provider.getBlockNumber();
            const network = await this.provider.getNetwork();
            
            return network.chainId === this.chainId && blockNumber > 0;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    }

    /**
     * Obtiene el número de bloque actual
     */
    async getBlockNumber() {
        try {
            const provider = this.getProvider();
            return await provider.getBlockNumber();
        } catch (error) {
            console.error(`Error obteniendo block number: ${error.message}`);
            // Intentar reconectar
            await this.connect();
            return this.getBlockNumber();
        }
    }

    /**
     * Obtiene el gas price actual en gwei
     */
    async getGasPrice() {
        try {
            const provider = this.getProvider();
            const gasPrice = await provider.getGasPrice();
            return ethers.utils.formatUnits(gasPrice, 'gwei');
        } catch (error) {
            console.error(`Error obteniendo gas price: ${error.message}`);
            return null;
        }
    }

    /**
     * Verifica si una dirección de contrato es válida en Polygon
     */
    async isContract(address) {
        try {
            const provider = this.getProvider();
            const code = await provider.getCode(address);
            return code !== '0x';
        } catch (error) {
            console.error(`Error verificando contrato: ${error.message}`);
            return false;
        }
    }

    /**
     * Obtiene información básica de la red
     */
    async getNetworkInfo() {
        try {
            const provider = this.getProvider();
            const [blockNumber, network, gasPrice] = await Promise.all([
                provider.getBlockNumber(),
                provider.getNetwork(),
                provider.getGasPrice()
            ]);

            return {
                chainId: network.chainId,
                name: network.name,
                blockNumber,
                gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei'),
                isConnected: this.isConnected,
                activeRpc: this.rpcUrls[this.currentRpcIndex]
            };
        } catch (error) {
            console.error(`Error obteniendo info de red: ${error.message}`);
            return null;
        }
    }

    /**
     * Cambia manualmente el RPC (útil para testing)
     */
    switchRpc(index) {
        if (index >= 0 && index < this.rpcUrls.length) {
            this.currentRpcIndex = index;
            this.isConnected = false;
            console.log(`🔄 Cambiando manualmente a RPC: ${this.rpcUrls[index]}`);
            return this.connect();
        }
        throw new Error('Índice de RPC inválido');
    }

    /**
     * Lista todos los RPCs disponibles
     */
    listRpcs() {
        return this.rpcUrls.map((url, index) => ({
            url,
            active: index === this.currentRpcIndex,
            status: index === this.currentRpcIndex ? (this.isConnected ? '✅' : '❌') : '⚪'
        }));
    }
}

// Exportar una instancia única (singleton)
module.exports = new PolygonService();
