const { ethers } = require('ethers');

class PolygonService {
    constructor() {
        this.rpcUrls = [
            'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon'
        ];
        this.currentRpcIndex = 0;
        this.provider = null;
        this.isConnected = false;
    }

    async connect() {
        const rpcUrl = this.rpcUrls[this.currentRpcIndex];
        console.log(`🔄 Conectando a Polygon usando: ${rpcUrl}`);

        try {
            this.provider = new ethers.providers.JsonRpcProvider({
                url: rpcUrl,
                timeout: 15000
            });

            const [blockNumber, network] = await Promise.all([
                this.provider.getBlockNumber(),
                this.provider.getNetwork()
            ]);

            if (network.chainId !== 137) {
                throw new Error(`ChainId incorrecto`);
            }

            this.isConnected = true;
            console.log(`✅ Conectado a Polygon - Bloque: ${blockNumber}`);
            console.log(`🌐 Red: ${network.name} (Chain ID: ${network.chainId})`);
            return true;

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            this.isConnected = false;
            this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcUrls.length;
            return this.connect();
        }
    }

    getProvider() {
        if (!this.provider || !this.isConnected) {
            throw new Error('Proveedor no inicializado');
        }
        return this.provider;
    }

    async getBlockNumber() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }
        return await this.provider.getBlockNumber();
    }

    async getGasPrice() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }
        const gasPrice = await this.provider.getGasPrice();
        return ethers.utils.formatUnits(gasPrice, 'gwei');
    }

    async getNetworkInfo() {
        if (!this.provider || !this.isConnected) {
            await this.connect();
        }
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
    }
}

module.exports = new PolygonService();
