const { ethers } = require('ethers');

class PolygonService {
    constructor() {
        this.rpcUrls = [
            'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon-bor-rpc.publicnode.com'
        ];
        this.currentRpcIndex = 0;
        this.provider = null;
        this.isConnected = false;
    }

    // Método de conexión principal
    async connect() {
        const rpcUrl = this.rpcUrls[this.currentRpcIndex];
        console.log(`🔄 Conectando a Polygon usando: ${rpcUrl}`);

        try {
            // Crear proveedor con timeout
            this.provider = new ethers.providers.JsonRpcProvider({
                url: rpcUrl,
                timeout: 15000
            });

            // Verificar conexión obteniendo datos
            const [blockNumber, network] = await Promise.all([
                this.provider.getBlockNumber(),
                this.provider.getNetwork()
            ]);

            // Verificar que sea Polygon (chainId 137)
            if (network.chainId !== 137) {
                throw new Error(`ChainId incorrecto: esperado 137, obtenido ${network.chainId}`);
            }

            this.isConnected = true;
            
            console.log(`✅ Conectado a Polygon - Bloque actual: ${blockNumber}`);
            console.log(`🌐 Red: ${network.name} (Chain ID: ${network.chainId})`);
            
            return true;

        } catch (error) {
            console.error(`❌ Error conectando a ${rpcUrl}: ${error.message}`);
            this.isConnected = false;
            
            // Intentar con el siguiente RPC
            this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
            
            // Si volvemos al primero después de intentar todos, esperamos y reintentamos
            if (this.currentRpcIndex === 0) {
                console.log('⏳ Todos los RPCs fallaron. Esperando 5 segundos para reintentar...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
            
            return this.connect(); // Reintentar recursivamente
        }
    }

    // Obtener información de la red
    async getNetworkInfo() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }

        try {
            const [blockNumber, network, gasPrice] = await Promise.all([
                this.provider.getBlockNumber(),
                this.provider.getNetwork(),
                this.provider.getGasPrice()
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
            // Intentar reconectar
            this.isConnected = false;
            await this.connect();
            return this.getNetworkInfo(); // Reintentar
        }
    }

    // Obtener número de bloque actual
    async getBlockNumber() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }
        
        try {
            return await this.provider.getBlockNumber();
        } catch (error) {
            console.error(`Error obteniendo bloque: ${error.message}`);
            this.isConnected = false;
            await this.connect();
            return this.getBlockNumber();
        }
    }

    // Obtener gas price actual
    async getGasPrice() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }
        
        try {
            const gasPrice = await this.provider.getGasPrice();
            return ethers.utils.formatUnits(gasPrice, 'gwei');
        } catch (error) {
            console.error(`Error obteniendo gas price: ${error.message}`);
            return null;
        }
    }

    // Cambiar RPC manualmente
    async switchRpc(index) {
        if (index >= 0 && index < this.rpcUrls.length) {
            this.currentRpcIndex = index;
            this.isConnected = false;
            console.log(`🔄 Cambiando manualmente a RPC: ${this.rpcUrls[index]}`);
            return this.connect();
        }
        throw new Error('Índice de RPC inválido');
    }
}

// Exportar UNA SOLA INSTANCIA (singleton)
module.exports = new PolygonService();
