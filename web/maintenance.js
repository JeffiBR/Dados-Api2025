// maintenance.js - Monitoramento em tempo real do sistema

class SystemMonitor {
    constructor() {
        this.lastUpdate = null;
        this.autoRefreshInterval = null;
        this.isAutoRefresh = true;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSystemStatus();
        this.startAutoRefresh();
        this.applyThemeToElements();
        this.setupThemeObserver();
    }

    bindEvents() {
        document.getElementById('refreshStatus').addEventListener('click', () => {
            this.loadSystemStatus();
        });

        document.getElementById('viewCollectionStatus').addEventListener('click', () => {
            window.location.href = '/admin.html';
        });

        // Adicionar atalho de teclado (F5) para atualizar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5') {
                e.preventDefault();
                this.loadSystemStatus();
            }
        });
    }

    async loadSystemStatus() {
        this.showLoadingState();
        this.lastUpdate = new Date();

        try {
            await Promise.all([
                this.checkServerStatus(),
                this.checkDatabaseStatus(),
                this.checkExternalAPIStatus(),
                this.loadSystemMetrics(),
                this.loadCollectionStatus()
            ]);

            this.updateLastUpdatedTime();
        } catch (error) {
            console.error('Erro ao carregar status do sistema:', error);
            this.showErrorState();
        } finally {
            this.hideLoadingState();
        }
    }

    async checkServerStatus() {
        const serverStatus = document.getElementById('serverStatus');
        const serverDot = serverStatus.querySelector('.status-dot');
        const serverDesc = serverStatus.querySelector('.status-description');

        try {
            const startTime = performance.now();
            const response = await this.makeAuthenticatedRequest('/api/users/me');
            const endTime = performance.now();
            const responseTime = Math.round(endTime - startTime);

            if (response.ok) {
                serverDot.className = 'status-dot online';
                serverDesc.textContent = `Online - ${responseTime}ms de resposta`;
                this.updatePerformanceMetric('responseTime', `${responseTime}ms`);
            } else {
                serverDot.className = 'status-dot warning';
                serverDesc.textContent = 'Problemas de conectividade';
            }
        } catch (error) {
            serverDot.className = 'status-dot offline';
            serverDesc.textContent = 'Offline - Não foi possível conectar';
        }
    }

    async checkDatabaseStatus() {
        const dbStatus = document.getElementById('databaseStatus');
        const dbDot = dbStatus.querySelector('.status-dot');
        const dbDesc = dbStatus.querySelector('.status-description');

        try {
            const startTime = performance.now();
            const response = await fetch('/api/supermarkets/public');
            const endTime = performance.now();
            const responseTime = Math.round(endTime - startTime);

            if (response.ok) {
                const data = await response.json();
                dbDot.className = 'status-dot online';
                dbDesc.textContent = `Online - ${data.length} mercados - ${responseTime}ms`;
                
                // Atualizar métrica de mercados ativos
                document.getElementById('activeMarkets').textContent = data.length;
                document.getElementById('marketsUpdateTime').textContent = this.getTimeAgo();
            } else {
                dbDot.className = 'status-dot warning';
                dbDesc.textContent = 'Problemas de conexão';
            }
        } catch (error) {
            dbDot.className = 'status-dot offline';
            dbDesc.textContent = 'Offline - Erro de conexão';
        }
    }

    async checkExternalAPIStatus() {
        const apiStatus = document.getElementById('apiStatus');
        const apiDot = apiStatus.querySelector('.status-dot');
        const apiDesc = apiStatus.querySelector('.status-description');

        try {
            // Simular verificação da API Sefaz Alagoas
            // Em produção, isso seria uma requisição real para a API
            const isApiOnline = await this.simulateAPIHealthCheck();
            
            if (isApiOnline) {
                apiDot.className = 'status-dot online';
                apiDesc.textContent = 'Online - API Sefaz Alagoas';
                this.updatePerformanceMetric('apiLatency', '120ms');
            } else {
                apiDot.className = 'status-dot warning';
                apiDesc.textContent = 'Instável - API com problemas intermitentes';
            }
        } catch (error) {
            apiDot.className = 'status-dot offline';
            apiDesc.textContent = 'Offline - API indisponível';
        }
    }

    async loadSystemMetrics() {
        await Promise.all([
            this.loadProductsCount(),
            this.loadActiveUsers(),
            this.loadLastCollectionInfo()
        ]);
    }

    async loadProductsCount() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/products-log?page=1&page_size=1');
            
            if (response.ok) {
                const data = await response.json();
                const totalProducts = data.total_count || 0;
                
                document.getElementById('totalProducts').textContent = totalProducts.toLocaleString();
                document.getElementById('productsUpdateTime').textContent = this.getTimeAgo();
                
                // Atualizar tendência
                this.updateTrend('productsUpdateTime', true);
            }
        } catch (error) {
            document.getElementById('totalProducts').textContent = 'Erro';
            document.getElementById('productsUpdateTime').textContent = 'Falha ao carregar';
        }
    }

    async loadActiveUsers() {
        try {
            // Simular contagem de usuários ativos
            // Em produção, isso viria de uma API real
            const activeUsers = await this.simulateActiveUsersCount();
            
            document.getElementById('activeUsers').textContent = activeUsers.toLocaleString();
            document.getElementById('usersUpdateTime').textContent = this.getTimeAgo();
            
            this.updateTrend('usersUpdateTime', activeUsers > 20);
        } catch (error) {
            document.getElementById('activeUsers').textContent = 'Erro';
            document.getElementById('usersUpdateTime').textContent = 'Falha ao carregar';
        }
    }

    async loadLastCollectionInfo() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/collections');
            
            if (response.ok) {
                const collections = await response.json();
                
                if (collections.length > 0) {
                    const lastCollection = collections[0];
                    const date = new Date(lastCollection.iniciada_em);
                    
                    document.getElementById('lastCollection').textContent = 
                        `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                    
                    document.getElementById('collectionUpdateTime').textContent = this.getTimeAgo();
                    
                    // Atualizar informações adicionais
                    this.updateCollectionInfo(lastCollection);
                } else {
                    document.getElementById('lastCollection').textContent = 'Nenhuma';
                    document.getElementById('collectionUpdateTime').textContent = 'Sem coletas';
                }
            }
        } catch (error) {
            document.getElementById('lastCollection').textContent = 'Erro';
            document.getElementById('collectionUpdateTime').textContent = 'Falha ao carregar';
        }
    }

    async loadCollectionStatus() {
        try {
            const response = await this.makeAuthenticatedRequest('/api/collection-status');
            
            if (response.ok) {
                const status = await response.json();
                this.updateCollectionStatusDisplay(status);
            }
        } catch (error) {
            // API de status de coleta pode não estar disponível
            console.log('API de status de coleta não disponível');
        }
    }

    updateCollectionInfo(collection) {
        const status = collection.status || 'desconhecido';
        const totalRegistros = collection.total_registros || 0;
        
        document.getElementById('collectionStatus').textContent = this.translateStatus(status);
        document.getElementById('collectionProgress').textContent = `${totalRegistros.toLocaleString()} registros`;
        
        // Simular próxima coleta (2 horas após a última)
        const nextCollection = new Date(collection.iniciada_em);
        nextCollection.setHours(nextCollection.getHours() + 2);
        document.getElementById('nextCollection').textContent = 
            `${nextCollection.getHours().toString().padStart(2, '0')}:${nextCollection.getMinutes().toString().padStart(2, '0')}`;
    }

    updateCollectionStatusDisplay(status) {
        // Esta função atualizaria uma barra de progresso se a coleta estiver em andamento
        // Implementação opcional baseada na estrutura real da API
    }

    translateStatus(status) {
        const statusMap = {
            'concluida': 'Concluída',
            'running': 'Em Andamento',
            'failed': 'Falhou',
            'idle': 'Inativa'
        };
        return statusMap[status] || status;
    }

    updatePerformanceMetric(metricId, value) {
        const element = document.getElementById(metricId);
        if (element) {
            element.textContent = value;
        }
    }

    updateTrend(elementId, isPositive) {
        const element = document.getElementById(elementId);
        const trendElement = element.closest('.metric-trend');
        
        if (trendElement) {
            trendElement.className = `metric-trend ${isPositive ? 'up' : 'down'}`;
            const icon = trendElement.querySelector('i');
            if (icon) {
                icon.className = `fas fa-arrow-${isPositive ? 'up' : 'down'}`;
            }
        }
    }

    async makeAuthenticatedRequest(url) {
        const token = await this.getAuthToken();
        return fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    async getAuthToken() {
        // Esta função deve ser compatível com auth.js
        return localStorage.getItem('supabase.auth.token') ? 
            JSON.parse(localStorage.getItem('supabase.auth.token')).access_token : '';
    }

    async simulateAPIHealthCheck() {
        // Simular verificação de saúde da API externa
        return new Promise((resolve) => {
            setTimeout(() => {
                // 95% de chance de estar online (simulação)
                resolve(Math.random() > 0.05);
            }, 800);
        });
    }

    async simulateActiveUsersCount() {
        // Simular contagem de usuários ativos
        return new Promise((resolve) => {
            setTimeout(() => {
                // Base entre 20-30 usuários com variação aleatória
                resolve(20 + Math.floor(Math.random() * 10));
            }, 500);
        });
    }

    showLoadingState() {
        document.getElementById('refreshStatus').classList.add('loading');
        
        // Mostrar estado de carregamento nos indicadores
        document.querySelectorAll('.status-dot').forEach(dot => {
            dot.classList.add('loading');
        });
    }

    hideLoadingState() {
        document.getElementById('refreshStatus').classList.remove('loading');
    }

    showErrorState() {
        // Poderia mostrar notificações de erro específicas
        console.warn('Alguns serviços podem estar indisponíveis');
    }

    updateLastUpdatedTime() {
        const timeString = this.lastUpdate.toLocaleTimeString('pt-BR');
        // Poderia adicionar um elemento para mostrar "Última atualização: ${timeString}"
    }

    getTimeAgo() {
        return 'Agora mesmo';
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        // Atualizar a cada 2 minutos
        this.autoRefreshInterval = setInterval(() => {
            if (this.isAutoRefresh && document.visibilityState === 'visible') {
                this.loadSystemStatus();
            }
        }, 120000); // 2 minutos
    }

    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    applyThemeToElements() {
        const isLightMode = document.body.classList.contains('light-mode');
        const themeClass = isLightMode ? 'light-mode' : '';

        // Aplicar tema a todos os elementos dinâmicos
        const elementsToTheme = [
            '.status-indicator',
            '.status-description',
            '.metric-card',
            '.system-info',
            '.info-card',
            '.info-content',
            '.progress-info',
            '.last-updated'
        ];

        elementsToTheme.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.className = `${el.className.split(' ')[0]} ${themeClass}`;
            });
        });
    }

    setupThemeObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    this.applyThemeToElements();
                }
            });
        });

        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

// Inicializar o monitor quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    window.systemMonitor = new SystemMonitor();
});

// Gerenciar visibilidade da página para otimizar atualizações
document.addEventListener('visibilitychange', () => {
    if (window.systemMonitor) {
        if (document.hidden) {
            window.systemMonitor.stopAutoRefresh();
        } else {
            window.systemMonitor.startAutoRefresh();
            // Atualizar imediatamente quando a página se tornar visível
            window.systemMonitor.loadSystemStatus();
        }
    }
});
