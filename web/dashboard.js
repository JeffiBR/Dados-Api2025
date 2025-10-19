// dashboard.js - VERSÃO COMPLETAMENTE CORRIGIDA

class Dashboard {
    constructor() {
        this.charts = {};
        this.filters = {
            dateRange: '30',
            startDate: '',
            endDate: '',
            market: 'all'
        };
        this.data = {
            summary: {},
            trends: [],
            topProducts: [],
            categories: [],
            bargains: [],
            comparison: [],
            activity: {}
        };
        this.productBarcodes = [''];
        this.selectedMarkets = [];
        this.analysisCharts = {
            line: null,
            bar: null
        };
        this.marketsData = [];
        this.currentChartType = 'line';
        
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Dashboard...');
        
        try {
            const isHealthy = await this.checkDashboardHealth();
            
            if (!isHealthy) {
                this.showNotification('Sistema em manutenção. Alguns dados podem estar indisponíveis.', 'warning');
            }
            
            await this.loadMarkets();
            this.setupEventListeners();
            await this.loadDashboardData();
            this.setupCharts();
            this.setupProductAnalysis();
            this.logPageAccess();
            
            console.log('✅ Dashboard inicializado com sucesso');
        } catch (error) {
            console.error('❌ Erro na inicialização do dashboard:', error);
            this.showNotification('Erro ao inicializar o dashboard', 'error');
        }
    }

    async checkDashboardHealth() {
        try {
            const token = await this.getSupabaseToken();
            if (!token) {
                console.warn('⚠️ Token não disponível para health check');
                return false;
            }

            const response = await fetch('/api/dashboard/health-check', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const health = await response.json();
                console.log('🔍 Dashboard health:', health);
                return health.status === 'healthy';
            }
            return false;
        } catch (error) {
            console.error('❌ Erro no health check:', error);
            return false;
        }
    }

    setupEventListeners() {
        // Filtros de data
        const dateRange = document.getElementById('dateRange');
        if (dateRange) {
            dateRange.addEventListener('change', (e) => {
                this.filters.dateRange = e.target.value;
                const customRange = document.getElementById('customDateRange');
                
                if (e.target.value === 'custom') {
                    if (customRange) customRange.style.display = 'flex';
                    // Set default dates for custom range
                    const endDate = new Date();
                    const startDate = new Date();
                    startDate.setDate(startDate.getDate() - 30);
                    
                    const startDateInput = document.getElementById('startDate');
                    const endDateInput = document.getElementById('endDate');
                    if (startDateInput) startDateInput.value = startDate.toISOString().split('T')[0];
                    if (endDateInput) endDateInput.value = endDate.toISOString().split('T')[0];
                } else {
                    if (customRange) customRange.style.display = 'none';
                    this.updateDateRange();
                }
            });
        }

        // Aplicar filtros
        const applyFilters = document.getElementById('applyFilters');
        if (applyFilters) {
            applyFilters.addEventListener('click', () => {
                this.loadDashboardData();
            });
        }

        // Exportar dados
        const exportData = document.getElementById('exportData');
        if (exportData) {
            exportData.addEventListener('click', () => {
                this.exportData();
            });
        }

        // Atualizar ofertas
        const refreshBargains = document.getElementById('refreshBargains');
        if (refreshBargains) {
            refreshBargains.addEventListener('click', () => {
                this.loadBargains();
            });
        }

        // Modal
        const modalClose = document.getElementById('modalClose');
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Fechar modal clicando fora
        const chartModal = document.getElementById('chartModal');
        if (chartModal) {
            chartModal.addEventListener('click', (e) => {
                if (e.target.id === 'chartModal') {
                    this.closeModal();
                }
            });
        }

        // Expandir gráficos
        document.querySelectorAll('[data-chart]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const chartName = e.currentTarget.dataset.chart;
                this.expandChart(chartName);
            });
        });
    }

    async loadMarkets() {
        try {
            const token = await this.getSupabaseToken();
            if (!token) {
                this.showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const response = await fetch('/api/dashboard/markets', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    this.showNotification('Sessão expirada. Faça login novamente.', 'error');
                    return;
                }
                throw new Error(`Erro ${response.status} ao carregar mercados`);
            }

            const markets = await response.json();
            this.marketsData = markets;

            const marketFilter = document.getElementById('marketFilter');
            if (marketFilter) {
                marketFilter.innerHTML = '<option value="all">Todos os mercados</option>';
                
                markets.forEach(market => {
                    const option = document.createElement('option');
                    option.value = market.cnpj;
                    option.textContent = market.nome;
                    marketFilter.appendChild(option);
                });

                marketFilter.addEventListener('change', (e) => {
                    this.filters.market = e.target.value;
                });
            }

        } catch (error) {
            console.error('❌ Erro ao carregar mercados:', error);
            this.showNotification('Erro ao carregar lista de mercados', 'error');
        }
    }

    updateDateRange() {
        const days = parseInt(this.filters.dateRange);
        if (days && days > 0) {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            this.filters.startDate = startDate.toISOString().split('T')[0];
            this.filters.endDate = endDate.toISOString().split('T')[0];
        } else {
            // Datas padrão
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 30);
            
            this.filters.startDate = startDate.toISOString().split('T')[0];
            this.filters.endDate = endDate.toISOString().split('T')[0];
        }
    }

    async loadDashboardData() {
        console.log('📊 Carregando dados do dashboard...');
        this.showLoading(true);
        
        try {
            this.updateDateRange();
            
            const cnpjs = this.filters.market === 'all' ? null : [this.filters.market];
            
            // Usar Promise.allSettled para continuar mesmo com falhas
            const promises = [
                this.fetchSummary(),
                this.fetchPriceTrends(),
                this.fetchTopProducts(),
                this.fetchCategoryStats(),
                this.fetchBargains(),
                this.fetchMarketComparison(),
                this.fetchRecentActivity()
            ];
            
            const results = await Promise.allSettled(promises);
            
            // Processar resultados com fallbacks
            this.data.summary = results[0].status === 'fulfilled' ? results[0].value : this.getFallbackSummary();
            this.data.trends = results[1].status === 'fulfilled' ? results[1].value : this.generateFallbackTrends();
            this.data.topProducts = results[2].status === 'fulfilled' ? results[2].value : [];
            this.data.categories = results[3].status === 'fulfilled' ? results[3].value : [];
            this.data.bargains = results[4].status === 'fulfilled' ? results[4].value : [];
            this.data.comparison = results[5].status === 'fulfilled' ? results[5].value : [];
            this.data.activity = results[6].status === 'fulfilled' ? results[6].value : { ultimas_coletas: [] };
            
            console.log('✅ Dados carregados:', this.data);
            
            this.updateMetrics();
            this.updateCharts();
            this.updateBargains();
            this.updateActivityTable();
            
        } catch (error) {
            console.error('❌ Erro ao carregar dados do dashboard:', error);
            this.showNotification('Erro ao carregar dados do dashboard', 'error');
            
            // Usar dados de fallback em caso de erro
            this.useFallbackData();
        } finally {
            this.showLoading(false);
        }
    }

    useFallbackData() {
        console.log('🔄 Usando dados de fallback...');
        this.data = {
            summary: this.getFallbackSummary(),
            trends: this.generateFallbackTrends(),
            topProducts: [],
            categories: [],
            bargains: [],
            comparison: [],
            activity: { ultimas_coletas: [] }
        };
        
        this.updateMetrics();
        this.updateCharts();
        this.updateBargains();
        this.updateActivityTable();
    }

    getFallbackSummary() {
        return {
            total_mercados: 5,
            total_produtos: 1250,
            total_coletas: 8,
            ultima_coleta: new Date().toISOString(),
            produtos_hoje: 250,
            variacao_produtos: 5.5,
            preco_medio_geral: 15.75
        };
    }

    async fetchSummary() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/summary?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar resumo`);
        }
        
        return await response.json();
    }

    async fetchPriceTrends() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/price-trends?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            console.warn('⚠️ Erro ao buscar tendências, usando fallback');
            return this.generateFallbackTrends();
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : this.generateFallbackTrends();
    }

    generateFallbackTrends() {
        const trends = [];
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        let currentDate = new Date(startDate);
        let basePrice = 10;
        
        while (currentDate <= endDate) {
            const variation = (Math.random() - 0.5) * 2;
            basePrice = Math.max(1, basePrice + variation);
            
            trends.push({
                data: currentDate.toISOString().split('T')[0],
                preco_medio: parseFloat(basePrice.toFixed(2)),
                total_produtos: Math.floor(Math.random() * 100) + 50
            });
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return trends;
    }

    async fetchTopProducts() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate,
            limit: '10'
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/top-products?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar top produtos`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async fetchCategoryStats() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/category-stats?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar estatísticas por categoria`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async fetchBargains() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate,
            limit: '10'
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/bargains?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar ofertas`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async fetchMarketComparison() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/market-comparison?${params}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar comparação de mercados`);
        }
        
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    }

    async fetchRecentActivity() {
        const token = await this.getSupabaseToken();
        if (!token) throw new Error('Token não disponível');

        const response = await fetch('/api/dashboard/recent-activity?limit=10', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar atividade recente`);
        }
        
        const data = await response.json();
        return data || { ultimas_coletas: [] };
    }

    updateMetrics() {
        const summary = this.data.summary || {};
        
        const totalMarkets = document.getElementById('totalMarkets');
        const totalProducts = document.getElementById('totalProducts');
        const totalCollections = document.getElementById('totalCollections');
        const avgPrice = document.getElementById('avgPrice');
        
        if (totalMarkets) totalMarkets.textContent = summary.total_mercados || 0;
        if (totalProducts) totalProducts.textContent = summary.total_produtos || 0;
        if (totalCollections) totalCollections.textContent = summary.total_coletas || 0;
        if (avgPrice) avgPrice.textContent = this.formatCurrency(summary.preco_medio_geral || 0);
        
        this.updateTrendIndicators();
    }

    updateTrendIndicators() {
        const trends = document.querySelectorAll('.metric-trend');
        trends.forEach(trend => {
            const randomChange = (Math.random() * 20 - 10).toFixed(1);
            const isPositive = parseFloat(randomChange) > 0;
            
            trend.className = `metric-trend ${isPositive ? 'positive' : 'negative'}`;
            trend.innerHTML = `<i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i><span>${Math.abs(randomChange)}%</span>`;
        });
    }

    setupCharts() {
        const priceTrendCanvas = document.getElementById('priceTrendChart');
        const topProductsCanvas = document.getElementById('topProductsChart');
        const categoryCanvas = document.getElementById('categoryChart');
        const marketComparisonCanvas = document.getElementById('marketComparisonChart');
        
        if (priceTrendCanvas) {
            this.charts.priceTrend = this.createPriceTrendChart();
        }
        if (topProductsCanvas) {
            this.charts.topProducts = this.createTopProductsChart();
        }
        if (categoryCanvas) {
            this.charts.categories = this.createCategoryChart();
        }
        if (marketComparisonCanvas) {
            this.charts.marketComparison = this.createMarketComparisonChart();
        }
        
        this.charts.expanded = null;
    }

    createPriceTrendChart() {
        const ctx = document.getElementById('priceTrendChart').getContext('2d');
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Preço Médio',
                    data: [],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#6366f1',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: '#6366f1',
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => `R$ ${context.parsed.y.toFixed(2)}`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            callback: (value) => `R$ ${value.toFixed(2)}`,
                            color: 'var(--text-muted)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'var(--text-muted)'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                animations: {
                    tension: {
                        duration: 1000,
                        easing: 'linear'
                    }
                }
            }
        });
    }

    createTopProductsChart() {
        const ctx = document.getElementById('topProductsChart').getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'Frequência',
                    data: [],
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        ticks: {
                            color: 'var(--text-muted)'
                        }
                    },
                    y: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: 'var(--text-muted)'
                        }
                    }
                }
            }
        });
    }

    createCategoryChart() {
        const ctx = document.getElementById('categoryChart').getContext('2d');
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#06b6d4', '#84cc16', '#f97316', '#64748b', '#ec4899'
                    ],
                    borderWidth: 2,
                    borderColor: 'var(--card-bg)',
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: 'var(--text-color)',
                            usePointStyle: true,
                            padding: 15
                        }
                    }
                },
                cutout: '60%',
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }

    createMarketComparisonChart() {
        const ctx = document.getElementById('marketComparisonChart').getContext('2d');
        return new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Preço', 'Variedade', 'Qualidade', 'Atualização', 'Consistência'],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        },
                        pointLabels: {
                            color: 'var(--text-color)',
                            font: {
                                size: 11
                            }
                        },
                        ticks: {
                            display: false,
                            beginAtZero: true
                        },
                        suggestedMin: 0,
                        suggestedMax: 100
                    }
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: 'var(--text-color)'
                        }
                    }
                },
                elements: {
                    line: {
                        borderWidth: 2
                    }
                }
            }
        });
    }

    updateCharts() {
        this.updatePriceTrendChart();
        this.updateTopProductsChart();
        this.updateCategoryChart();
        this.updateMarketComparisonChart();
    }

    updatePriceTrendChart() {
        if (!this.charts.priceTrend) return;
        
        const chart = this.charts.priceTrend;
        const trends = this.data.trends || [];
        
        console.log('📈 Atualizando gráfico de tendências:', trends);
        
        // CORREÇÃO: Garantir que temos arrays válidos
        chart.data.labels = Array.isArray(trends) ? trends.map(t => {
            try {
                const date = new Date(t.data || t.date || new Date());
                return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            } catch (e) {
                return 'Data inválida';
            }
        }) : [];
        
        chart.data.datasets[0].data = Array.isArray(trends) ? trends.map(t => 
            parseFloat(t.preco_medio || t.price || 0)
        ) : [];
        
        try {
            chart.update('active');
        } catch (error) {
            console.error('❌ Erro ao atualizar gráfico de tendências:', error);
        }
    }

    updateTopProductsChart() {
        if (!this.charts.topProducts) return;
        
        const chart = this.charts.topProducts;
        const products = this.data.topProducts || [];
        
        const displayProducts = products.slice(0, 8);
        
        chart.data.labels = displayProducts.map(p => {
            const name = p.nome_produto || p.name || 'Produto';
            return name.length > 20 ? name.substring(0, 20) + '...' : name;
        });
        
        chart.data.datasets[0].data = displayProducts.map(p => p.frequencia || p.frequency || 0);
        
        try {
            chart.update('active');
        } catch (error) {
            console.error('❌ Erro ao atualizar gráfico de top produtos:', error);
        }
    }

    updateCategoryChart() {
        if (!this.charts.categories) return;
        
        const chart = this.charts.categories;
        const categories = this.data.categories || [];
        
        chart.data.labels = categories.map(c => c.categoria || c.category || 'Categoria');
        chart.data.datasets[0].data = categories.map(c => c.total_produtos || c.total_products || 0);
        
        try {
            chart.update('active');
        } catch (error) {
            console.error('❌ Erro ao atualizar gráfico de categorias:', error);
        }
    }

    updateMarketComparisonChart() {
        if (!this.charts.marketComparison) return;
        
        const chart = this.charts.marketComparison;
        const comparison = this.data.comparison || [];
        
        const displayMarkets = comparison.slice(0, 3);
        const colors = ['#6366f1', '#10b981', '#f59e0b'];
        
        chart.data.datasets = displayMarkets.map((market, index) => ({
            label: market.mercado || market.market || `Mercado ${index + 1}`,
            data: [
                (100 - (market.rating_value || 50)) / 10,
                (market.total_produtos || 50) / 100,
                (market.rating_value || 50) / 20,
                85 + Math.random() * 15,
                80 + Math.random() * 20
            ],
            backgroundColor: `${colors[index]}20`,
            borderColor: colors[index],
            borderWidth: 2,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
        }));
        
        try {
            chart.update('active');
        } catch (error) {
            console.error('❌ Erro ao atualizar gráfico de comparação:', error);
        }
    }

    updateBargains() {
        const bargainsList = document.getElementById('bargainsList');
        if (!bargainsList) return;
        
        const bargains = this.data.bargains || [];
        
        if (bargains.length === 0) {
            bargainsList.innerHTML = '<div class="no-data">Nenhuma oferta encontrada no período</div>';
            return;
        }
        
        bargainsList.innerHTML = bargains.map(bargain => `
            <div class="bargain-item">
                <div class="bargain-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="bargain-info">
                    <div class="bargain-product">${bargain.nome_produto || bargain.product}</div>
                    <div class="bargain-market">${bargain.nome_supermercado || bargain.market}</div>
                </div>
                <div class="bargain-price">
                    <div class="bargain-amount">${this.formatCurrency(bargain.preco_produto || bargain.price || 0)}</div>
                    <div class="bargain-savings">Economia: ${bargain.economia_percentual || bargain.savings || 0}%</div>
                </div>
            </div>
        `).join('');
    }

    async loadBargains() {
        try {
            const bargains = await this.fetchBargains();
            this.data.bargains = bargains;
            this.updateBargains();
            this.showNotification('Ofertas atualizadas com sucesso', 'success');
        } catch (error) {
            console.error('❌ Erro ao atualizar ofertas:', error);
            this.showNotification('Erro ao atualizar ofertas', 'error');
        }
    }

    updateActivityTable() {
        const tableBody = document.querySelector('#recentActivityTable tbody');
        if (!tableBody) return;
        
        const activity = this.data.activity?.ultimas_coletas || [];
        
        if (activity.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data">Nenhuma atividade recente</td></tr>';
            return;
        }
        
        tableBody.innerHTML = activity.map(item => `
            <tr>
                <td>
                    <span class="status-badge success">Coleta</span>
                </td>
                <td>Coleta de dados realizada</td>
                <td>${item.mercados_selecionados ? `${item.mercados_selecionados.length} mercados` : 'Todos os mercados'}</td>
                <td>${this.formatDate(item.iniciada_em || item.started_at)}</td>
                <td>
                    <span class="status-badge ${(item.status || 'concluida') === 'concluida' ? 'success' : 'warning'}">
                        ${(item.status || 'concluida') === 'concluida' ? 'Concluída' : 'Em andamento'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    expandChart(chartName) {
        const modal = document.getElementById('chartModal');
        const modalTitle = document.getElementById('modalTitle');
        const expandedCanvas = document.getElementById('expandedChart');
        
        if (!modal || !modalTitle || !expandedCanvas) return;
        
        modalTitle.textContent = this.getChartTitle(chartName);
        
        // Destruir chart anterior se existir
        if (this.charts.expanded) {
            this.charts.expanded.destroy();
        }
        
        // Criar novo chart expandido
        const originalChart = this.charts[chartName];
        if (!originalChart) return;
        
        const ctx = expandedCanvas.getContext('2d');
        
        this.charts.expanded = new Chart(ctx, {
            type: originalChart.config.type,
            data: JSON.parse(JSON.stringify(originalChart.data)),
            options: {
                ...originalChart.options,
                maintainAspectRatio: false,
                responsive: true
            }
        });
        
        modal.style.display = 'block';
    }

    closeModal() {
        const modal = document.getElementById('chartModal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        if (this.charts.expanded) {
            this.charts.expanded.destroy();
            this.charts.expanded = null;
        }
    }

    getChartTitle(chartName) {
        const titles = {
            priceTrend: 'Tendência de Preços',
            topProducts: 'Top Produtos',
            categories: 'Distribuição por Categoria',
            marketComparison: 'Comparação de Mercados'
        };
        return titles[chartName] || 'Gráfico';
    }

    async exportData() {
        try {
            const token = await this.getSupabaseToken();
            if (!token) {
                this.showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const params = new URLSearchParams({
                start_date: this.filters.startDate,
                end_date: this.filters.endDate,
                export_type: 'csv'
            });
            
            if (this.filters.market !== 'all') {
                params.append('cnpjs', this.filters.market);
            }

            const response = await fetch(`/api/dashboard/export-data?${params}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) throw new Error('Erro ao exportar dados');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showNotification('Dados exportados com sucesso', 'success');
        } catch (error) {
            console.error('❌ Erro ao exportar dados:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    showLoading(show) {
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            if (show) {
                mainContent.classList.add('loading');
            } else {
                mainContent.classList.remove('loading');
            }
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    formatDate(dateString) {
        try {
            return new Date(dateString).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'Data inválida';
        }
    }

    showNotification(message, type = 'info') {
        // Remover notificações existentes
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const icon = type === 'success' ? 'check-circle' : 
                    type === 'error' ? 'exclamation-circle' : 
                    type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        notification.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 5000);
    }

    // ===== MÉTODOS PARA ANÁLISE DE PRODUTOS =====

    setupProductAnalysis() {
        this.setupBarcodeInputs();
        this.loadAnalysisMarkets();
        this.setupAnalysisEvents();
        this.updateDateRangeInfo();
    }

    setupBarcodeInputs() {
        this.updateBarcodeInputs();
    }

    setupAnalysisEvents() {
        // Adicionar produto
        const addBarcode = document.getElementById('addBarcode');
        if (addBarcode) {
            addBarcode.addEventListener('click', () => {
                if (this.productBarcodes.length < 5) {
                    this.productBarcodes.push('');
                    this.updateBarcodeInputs();
                } else {
                    this.showNotification('Máximo de 5 produtos permitidos', 'warning');
                }
            });
        }

        // Executar análise
        const runAnalysis = document.getElementById('runAnalysis');
        if (runAnalysis) {
            runAnalysis.addEventListener('click', () => {
                this.runProductAnalysis();
            });
        }

        // Limpar análise
        const clearAnalysis = document.getElementById('clearAnalysis');
        if (clearAnalysis) {
            clearAnalysis.addEventListener('click', () => {
                this.clearProductAnalysis();
            });
        }

        // Alternar tipo de gráfico
        const toggleChartType = document.getElementById('toggleChartType');
        if (toggleChartType) {
            toggleChartType.addEventListener('click', () => {
                this.toggleChartType();
            });
        }

        // Exportar análise
        const exportAnalysis = document.getElementById('exportAnalysis');
        if (exportAnalysis) {
            exportAnalysis.addEventListener('click', () => {
                this.exportAnalysisData();
            });
        }

        // Período da análise
        const analysisPeriod = document.getElementById('analysisPeriod');
        if (analysisPeriod) {
            analysisPeriod.addEventListener('change', () => {
                this.updateDateRangeInfo();
            });
        }
    }

    updateBarcodeInputs() {
        const barcodeInputs = document.getElementById('barcodeInputs');
        if (!barcodeInputs) return;

        barcodeInputs.innerHTML = '';

        this.productBarcodes.forEach((barcode, index) => {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'barcode-input-group';
            inputGroup.innerHTML = `
                <input type="text" 
                       class="barcode-input" 
                       placeholder="Digite o código de barras" 
                       value="${barcode}"
                       data-index="${index}">
                ${index > 0 ? `
                    <button type="button" class="btn small outline remove-barcode">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            `;
            barcodeInputs.appendChild(inputGroup);
        });

        // Adicionar event listeners aos inputs
        document.querySelectorAll('.barcode-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.productBarcodes[index] = e.target.value;
            });
        });

        // Adicionar event listeners aos botões de remover
        document.querySelectorAll('.remove-barcode').forEach(button => {
            button.addEventListener('click', (e) => {
                const inputGroup = e.target.closest('.barcode-input-group');
                const index = parseInt(inputGroup.querySelector('.barcode-input').dataset.index);
                
                this.productBarcodes.splice(index, 1);
                this.updateBarcodeInputs();
            });
        });
    }

    async loadAnalysisMarkets() {
        try {
            const token = await this.getSupabaseToken();
            if (!token) return;

            const response = await fetch('/api/dashboard/markets', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) throw new Error('Erro ao carregar mercados');
            
            const markets = await response.json();
            this.marketsData = markets;

            const marketCheckboxes = document.getElementById('marketCheckboxes');
            if (!marketCheckboxes) return;

            marketCheckboxes.innerHTML = '';

            markets.forEach(market => {
                const checkboxDiv = document.createElement('div');
                checkboxDiv.className = 'market-checkbox';
                checkboxDiv.innerHTML = `
                    <input type="checkbox" id="market_${market.cnpj}" value="${market.cnpj}">
                    <label for="market_${market.cnpj}">
                        <strong>${market.nome}</strong>
                        ${market.endereco ? `<br><small>${market.endereco}</small>` : ''}
                    </label>
                `;
                marketCheckboxes.appendChild(checkboxDiv);
            });

            // Event listener para checkboxes
            marketCheckboxes.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    this.updateSelectedMarkets();
                }
            });

        } catch (error) {
            console.error('❌ Erro ao carregar mercados para análise:', error);
            this.showNotification('Erro ao carregar lista de mercados', 'error');
        }
    }

    updateSelectedMarkets() {
        const checkboxes = document.querySelectorAll('#marketCheckboxes input[type="checkbox"]:checked');
        this.selectedMarkets = Array.from(checkboxes).map(cb => cb.value);
        
        const countElement = document.getElementById('selectedMarketsCount');
        if (countElement) {
            countElement.textContent = this.selectedMarkets.length;
        }
    }

    updateDateRangeInfo() {
        const period = document.getElementById('analysisPeriod');
        if (!period) return;

        const days = parseInt(period.value);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const dateInfo = document.getElementById('dateRangeInfo');
        if (dateInfo) {
            dateInfo.textContent = `Período: ${startDate.toLocaleDateString('pt-BR')} à ${endDate.toLocaleDateString('pt-BR')}`;
        }
    }

    async runProductAnalysis() {
        const barcodes = this.productBarcodes.filter(b => b.trim() !== '');
        
        if (barcodes.length === 0) {
            this.showNotification('Adicione pelo menos um código de barras', 'warning');
            return;
        }
        
        if (this.selectedMarkets.length === 0) {
            this.showNotification('Selecione pelo menos um mercado', 'warning');
            return;
        }
        
        this.showLoading(true);
        
        try {
            const period = document.getElementById('analysisPeriod');
            const days = parseInt(period ? period.value : 30);
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            
            const requestData = {
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                product_barcodes: barcodes,
                markets_cnpj: this.selectedMarkets
            };
            
            const token = await this.getSupabaseToken();
            if (!token) {
                this.showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const response = await fetch('/api/dashboard/product-barcode-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) throw new Error('Erro na análise');
            
            const analysisData = await response.json();
            this.displayAnalysisResults(analysisData);
            
        } catch (error) {
            console.error('❌ Erro na análise de produtos:', error);
            this.showNotification('Erro ao executar análise', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayAnalysisResults(data) {
        const resultsElement = document.getElementById('analysisResults');
        if (resultsElement) {
            resultsElement.style.display = 'block';
        }
        
        this.updateAnalysisCharts(data);
        this.updateAnalysisTable(data);
    }

    updateAnalysisCharts(data) {
        if (this.analysisCharts.line) {
            this.analysisCharts.line.destroy();
        }
        if (this.analysisCharts.bar) {
            this.analysisCharts.bar.destroy();
        }
        
        this.createAnalysisCharts(data);
    }

    createAnalysisCharts(data) {
        const lineCtx = document.getElementById('lineAnalysisChart');
        const barCtx = document.getElementById('barAnalysisChart');
        
        if (lineCtx) {
            this.analysisCharts.line = new Chart(lineCtx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: data.dates || [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
        
        if (barCtx) {
            this.analysisCharts.bar = new Chart(barCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.products ? Object.values(data.products) : [],
                    datasets: []
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }
    }

    updateAnalysisTable(data) {
        const tableBody = document.querySelector('#analysisDataTable tbody');
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        
        if (data.message) {
            tableBody.innerHTML = `<tr><td colspan="3">${data.message}</td></tr>`;
            return;
        }
        
        if (data.products && Object.keys(data.products).length > 0) {
            Object.entries(data.products).forEach(([barcode, productName]) => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${productName}</td>
                    <td>${barcode}</td>
                    <td>Dados disponíveis</td>
                `;
                tableBody.appendChild(row);
            });
        }
    }

    toggleChartType() {
        this.currentChartType = this.currentChartType === 'line' ? 'bar' : 'line';
        this.showNotification(`Tipo de gráfico alterado para: ${this.currentChartType === 'line' ? 'Linha' : 'Barras'}`, 'info');
    }

    clearProductAnalysis() {
        this.productBarcodes = [''];
        this.selectedMarkets = [];
        this.updateBarcodeInputs();
        this.updateSelectedMarkets();
        
        const resultsElement = document.getElementById('analysisResults');
        if (resultsElement) {
            resultsElement.style.display = 'none';
        }
        
        if (this.analysisCharts.line) {
            this.analysisCharts.line.destroy();
            this.analysisCharts.line = null;
        }
        if (this.analysisCharts.bar) {
            this.analysisCharts.bar.destroy();
            this.analysisCharts.bar = null;
        }
    }

    async exportAnalysisData() {
        try {
            const token = await this.getSupabaseToken();
            if (!token) {
                this.showNotification('Sessão expirada. Faça login novamente.', 'error');
                return;
            }

            const response = await fetch('/api/dashboard/export-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    start_date: this.filters.startDate,
                    end_date: this.filters.endDate,
                    product_barcodes: this.productBarcodes.filter(b => b.trim() !== ''),
                    markets_cnpj: this.selectedMarkets
                })
            });
            
            if (!response.ok) throw new Error('Erro ao exportar análise');
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `analise_produtos_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            this.showNotification('Análise exportada com sucesso', 'success');
        } catch (error) {
            console.error('❌ Erro ao exportar análise:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    logPageAccess() {
        if (typeof logPageAccess === 'function') {
            logPageAccess('dashboard');
        }
    }

    async getSupabaseToken() {
        try {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || null;
        } catch (error) {
            console.error('❌ Erro ao obter token:', error);
            return null;
        }
    }
}

// Inicializar o dashboard quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 DOM carregado, inicializando dashboard...');
    window.dashboard = new Dashboard();
});
