// dashboard-data.js - Versão com dados reais

class DashboardData {
    constructor() {
        this.baseURL = '/api/dashboard';
        this.cache = new Map();
        this.cacheTimeout = 300000; // 5 minutos
    }

    async getToken() {
        try {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || null;
        } catch (error) {
            console.error('❌ Erro ao obter token:', error);
            return null;
        }
    }

    async fetchWithCache(endpoint, params = {}) {
        const cacheKey = `${endpoint}-${JSON.stringify(params)}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const data = await this.fetchData(endpoint, params);
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            return data;
        } catch (error) {
            // Se houver cache, usar mesmo que expirado
            if (cached) {
                console.warn('⚠️ Usando cache expirado devido a erro:', error);
                return cached.data;
            }
            throw error;
        }
    }

    async fetchData(endpoint, params = {}) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const queryString = Object.keys(params).length > 0 
            ? `?${new URLSearchParams(params).toString()}`
            : '';

        const response = await fetch(`${this.baseURL}${endpoint}${queryString}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Sessão expirada');
            }
            throw new Error(`Erro ${response.status} em ${endpoint}`);
        }

        return await response.json();
    }

    async postData(endpoint, data) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`Erro ${response.status} em ${endpoint}`);
        }

        return await response.json();
    }

    // Métodos específicos do dashboard
    async getMarketStats() {
        return this.fetchWithCache('/market-stats');
    }

    async getDashboardSummary(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/summary', params);
    }

    async getProductsByMarket(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/products-by-market', params);
    }

    async getPriceTrends(startDate, endDate, cnpjs = null) {
        const params = {
            start_date: startDate,
            end_date: endDate
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }
        return this.fetchWithCache('/price-trends', params);
    }

    async getRecentCollections(limit = 5) {
        return this.fetchWithCache('/recent-collections', { limit });
    }

    async getMarkets() {
        return this.fetchWithCache('/markets');
    }

    async getProductBarcodeAnalysis(requestData) {
        return this.postData('/barcode-analysis', requestData);
    }

    async getProductInfo(barcode) {
        return this.fetchWithCache(`/product-info/${barcode}`);
    }

    async getProductSuggestions(query, limit = 10) {
        return this.fetchWithCache('/product-suggestions', { query, limit });
    }

    async exportData(startDate, endDate, cnpjs = null, exportType = 'csv') {
        const params = {
            start_date: startDate,
            end_date: endDate,
            export_type: exportType
        };
        if (cnpjs && cnpjs !== 'all') {
            params.cnpjs = cnpjs;
        }

        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}/export-data?${new URLSearchParams(params)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar dados');
        }

        return await response.blob();
    }

    async exportAnalysisData(requestData) {
        const token = await this.getToken();
        if (!token) {
            throw new Error('Token não disponível');
        }

        const response = await fetch(`${this.baseURL}/export-analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            throw new Error('Erro ao exportar análise');
        }

        return await response.blob();
    }

    clearCache() {
        this.cache.clear();
    }

    // Método para buscar estatísticas em tempo real
    async getRealTimeStats() {
        try {
            const [marketStats, recentCollections] = await Promise.all([
                this.getMarketStats(),
                this.getRecentCollections(3)
            ]);

            return {
                marketStats,
                recentCollections
            };
        } catch (error) {
            console.error('Erro ao buscar estatísticas em tempo real:', error);
            throw error;
        }
    }
}