// Dashboard JavaScript - Thunder Theme

class Dashboard {
    constructor() {
        this.charts = {};
        this.filters = {
            dateRange: '30',
            startDate: '',
            endDate: '',
            market: 'all'
        };
        this.data = {};
        this.productBarcodes = [''];
        this.selectedMarkets = [];
        this.analysisCharts = {
            line: null,
            bar: null
        };
        this.marketsData = [];
        this.currentChartType = 'line'; // 'line' or 'bar'
        
        this.init();
    }

    async init() {
        await this.loadMarkets();
        this.setupEventListeners();
        await this.loadDashboardData();
        this.setupCharts();
        this.setupProductAnalysis();
        this.logPageAccess();
    }

    setupEventListeners() {
        // Filtros de data
        document.getElementById('dateRange').addEventListener('change', (e) => {
            this.filters.dateRange = e.target.value;
            const customRange = document.getElementById('customDateRange');
            
            if (e.target.value === 'custom') {
                customRange.style.display = 'flex';
                // Set default dates for custom range
                const endDate = new Date();
                const startDate = new Date();
                startDate.setDate(startDate.getDate() - 30);
                document.getElementById('startDate').value = startDate.toISOString().split('T')[0];
                document.getElementById('endDate').value = endDate.toISOString().split('T')[0];
            } else {
                customRange.style.display = 'none';
                this.updateDateRange();
            }
        });

        // Aplicar filtros
        document.getElementById('applyFilters').addEventListener('click', () => {
            this.loadDashboardData();
        });

        // Exportar dados
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Atualizar ofertas
        document.getElementById('refreshBargains').addEventListener('click', () => {
            this.loadBargains();
        });

        // Modal
        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal();
        });

        // Fechar modal clicando fora
        document.getElementById('chartModal').addEventListener('click', (e) => {
            if (e.target.id === 'chartModal') {
                this.closeModal();
            }
        });

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
            const response = await fetch('/api/dashboard/markets', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Erro ao carregar mercados');
            }

            const markets = await response.json();
            this.marketsData = markets;

            const marketFilter = document.getElementById('marketFilter');
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

        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
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
        }
    }

    async loadDashboardData() {
        this.showLoading(true);
        
        try {
            this.updateDateRange();
            
            const cnpjs = this.filters.market === 'all' ? null : [this.filters.market];
            
            // Carregar dados em paralelo
            const [summary, trends, topProducts, categories, bargains, comparison, activity] = await Promise.all([
                this.fetchSummary(),
                this.fetchPriceTrends(),
                this.fetchTopProducts(),
                this.fetchCategoryStats(),
                this.fetchBargains(),
                this.fetchMarketComparison(),
                this.fetchRecentActivity()
            ]);

            this.data = { summary, trends, topProducts, categories, bargains, comparison, activity };
            
            this.updateMetrics();
            this.updateCharts();
            this.updateBargains();
            this.updateActivityTable();
            
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            this.showNotification('Erro ao carregar dados do dashboard', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async fetchSummary() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/summary?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar resumo');
        return await response.json();
    }

    async fetchPriceTrends() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/price-trends?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar tendências');
        return await response.json();
    }

    async fetchTopProducts() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate,
            limit: '10'
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/top-products?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar top produtos');
        return await response.json();
    }

    async fetchCategoryStats() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/category-stats?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar estatísticas por categoria');
        return await response.json();
    }

    async fetchBargains() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate,
            limit: '10'
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/bargains?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar ofertas');
        return await response.json();
    }

    async fetchMarketComparison() {
        const params = new URLSearchParams({
            start_date: this.filters.startDate,
            end_date: this.filters.endDate
        });
        
        if (this.filters.market !== 'all') {
            params.append('cnpjs', this.filters.market);
        }

        const response = await fetch(`/api/dashboard/market-comparison?${params}`);
        if (!response.ok) throw new Error('Erro ao buscar comparação de mercados');
        return await response.json();
    }

    async fetchRecentActivity() {
        const response = await fetch('/api/dashboard/recent-activity?limit=10');
        if (!response.ok) throw new Error('Erro ao buscar atividade recente');
        return await response.json();
    }

    updateMetrics() {
        const summary = this.data.summary;
        
        document.getElementById('totalMarkets').textContent = summary.total_mercados || 0;
        document.getElementById('totalProducts').textContent = summary.total_produtos || 0;
        document.getElementById('totalCollections').textContent = summary.total_coletas || 0;
        document.getElementById('avgPrice').textContent = this.formatCurrency(summary.preco_medio_geral || 0);
        
        // Atualizar tendências (simulado - em produção viria da API)
        this.updateTrendIndicators();
    }

    updateTrendIndicators() {
        // Simular variações - em produção isso viria da API
        const trends = document.querySelectorAll('.metric-trend');
        trends.forEach(trend => {
            const randomChange = (Math.random() * 20 - 10).toFixed(1);
            const isPositive = parseFloat(randomChange) > 0;
            
            trend.className = `metric-trend ${isPositive ? 'positive' : 'negative'}`;
            trend.innerHTML = `<i class="fas fa-arrow-${isPositive ? 'up' : 'down'}"></i><span>${Math.abs(randomChange)}%</span>`;
        });
    }

    setupCharts() {
        this.charts.priceTrend = this.createPriceTrendChart();
        this.charts.topProducts = this.createTopProductsChart();
        this.charts.categories = this.createCategoryChart();
        this.charts.marketComparison = this.createMarketComparisonChart();
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
        const chart = this.charts.priceTrend;
        const trends = this.data.trends || [];
        
        chart.data.labels = trends.map(t => {
            const date = new Date(t.data);
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
        
        chart.data.datasets[0].data = trends.map(t => t.preco_medio);
        chart.update('active');
    }

    updateTopProductsChart() {
        const chart = this.charts.topProducts;
        const products = this.data.topProducts || [];
        
        // Limitar a 8 produtos para melhor visualização
        const displayProducts = products.slice(0, 8);
        
        chart.data.labels = displayProducts.map(p => {
            const name = p.nome_produto;
            return name.length > 20 ? name.substring(0, 20) + '...' : name;
        });
        
        chart.data.datasets[0].data = displayProducts.map(p => p.frequencia);
        chart.update('active');
    }

    updateCategoryChart() {
        const chart = this.charts.categories;
        const categories = this.data.categories || [];
        
        chart.data.labels = categories.map(c => c.categoria);
        chart.data.datasets[0].data = categories.map(c => c.total_produtos);
        chart.update('active');
    }

    updateMarketComparisonChart() {
        const chart = this.charts.marketComparison;
        const comparison = this.data.comparison || [];
        
        // Limitar a 3 mercados para melhor visualização
        const displayMarkets = comparison.slice(0, 3);
        
        const colors = ['#6366f1', '#10b981', '#f59e0b'];
        
        chart.data.datasets = displayMarkets.map((market, index) => ({
            label: market.mercado,
            data: [
                (100 - market.rating_value) / 10, // Preço (invertido - menor é melhor)
                market.total_produtos / 100,      // Variedade
                market.rating_value / 20,         // Qualidade
                85 + Math.random() * 15,          // Atualização (simulado)
                80 + Math.random() * 20           // Consistência (simulado)
            ],
            backgroundColor: `${colors[index]}20`,
            borderColor: colors[index],
            borderWidth: 2,
            pointBackgroundColor: colors[index],
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4
        }));
        
        chart.update('active');
    }

    updateBargains() {
        const bargainsList = document.getElementById('bargainsList');
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
                    <div class="bargain-product">${bargain.nome_produto}</div>
                    <div class="bargain-market">${bargain.nome_supermercado}</div>
                </div>
                <div class="bargain-price">
                    <div class="bargain-amount">${this.formatCurrency(bargain.preco_produto)}</div>
                    <div class="bargain-savings">Economia: ${bargain.economia_percentual}%</div>
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
            console.error('Erro ao atualizar ofertas:', error);
            this.showNotification('Erro ao atualizar ofertas', 'error');
        }
    }

    updateActivityTable() {
        const tableBody = document.querySelector('#recentActivityTable tbody');
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
                <td>${this.formatDate(item.iniciada_em)}</td>
                <td>
                    <span class="status-badge ${item.status === 'concluida' ? 'success' : 'warning'}">
                        ${item.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    expandChart(chartName) {
        const modal = document.getElementById('chartModal');
        const modalTitle = document.getElementById('modalTitle');
        const expandedCanvas = document.getElementById('expandedChart');
        
        modalTitle.textContent = this.getChartTitle(chartName);
        
        // Destruir chart anterior se existir
        if (this.charts.expanded) {
            this.charts.expanded.destroy();
        }
        
        // Criar novo chart expandido
        const originalChart = this.charts[chartName];
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
        document.getElementById('chartModal').style.display = 'none';
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
            const params = new URLSearchParams({
                start_date: this.filters.startDate,
                end_date: this.filters.endDate,
                export_type: 'csv'
            });
            
            if (this.filters.market !== 'all') {
                params.append('cnpjs', this.filters.market);
            }

            const response = await fetch(`/api/dashboard/export-data?${params}`);
            
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
            console.error('Erro ao exportar dados:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    showLoading(show) {
        const mainContent = document.querySelector('.main-content');
        if (show) {
            mainContent.classList.add('loading');
        } else {
            mainContent.classList.remove('loading');
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
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
        document.getElementById('addBarcode').addEventListener('click', () => {
            if (this.productBarcodes.length < 5) {
                this.productBarcodes.push('');
                this.updateBarcodeInputs();
            } else {
                this.showNotification('Máximo de 5 produtos permitidos', 'warning');
            }
        });

        // Executar análise
        document.getElementById('runAnalysis').addEventListener('click', () => {
            this.runProductAnalysis();
        });

        // Limpar análise
        document.getElementById('clearAnalysis').addEventListener('click', () => {
            this.clearProductAnalysis();
        });

        // Alternar tipo de gráfico
        document.getElementById('toggleChartType').addEventListener('click', () => {
            this.toggleChartType();
        });

        // Exportar análise
        document.getElementById('exportAnalysis').addEventListener('click', () => {
            this.exportAnalysisData();
        });

        // Período da análise
        document.getElementById('analysisPeriod').addEventListener('change', () => {
            this.updateDateRangeInfo();
        });
    }

    updateBarcodeInputs() {
        const barcodeInputs = document.getElementById('barcodeInputs');
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
            const response = await fetch('/api/dashboard/markets', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) throw new Error('Erro ao carregar mercados');
            
            const markets = await response.json();
            this.marketsData = markets;

            const marketCheckboxes = document.getElementById('marketCheckboxes');
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
            console.error('Erro ao carregar mercados para análise:', error);
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
        const period = document.getElementById('analysisPeriod').value;
        const days = parseInt(period);
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
            const period = document.getElementById('analysisPeriod').value;
            const days = parseInt(period);
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
            console.error('Erro na análise de produtos:', error);
            this.showNotification('Erro ao executar análise', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayAnalysisResults(data) {
        const resultsElement = document.getElementById('analysisResults');
        resultsElement.style.display = 'block';
        
        // Implementar a exibição dos resultados nos gráficos e tabela
        this.updateAnalysisCharts(data);
        this.updateAnalysisTable(data);
    }

    updateAnalysisCharts(data) {
        // Implementar atualização dos gráficos de análise
        if (this.analysisCharts.line) {
            this.analysisCharts.line.destroy();
        }
        if (this.analysisCharts.bar) {
            this.analysisCharts.bar.destroy();
        }
        
        // Criar gráficos com os dados recebidos
        this.createAnalysisCharts(data);
    }

    createAnalysisCharts(data) {
        const lineCtx = document.getElementById('lineAnalysisChart').getContext('2d');
        const barCtx = document.getElementById('barAnalysisChart').getContext('2d');
        
        // Implementar criação dos gráficos com os dados
        // Esta é uma implementação básica - adaptar conforme a estrutura dos dados
        this.analysisCharts.line = new Chart(lineCtx, {
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
        
        this.analysisCharts.bar = new Chart(barCtx, {
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

    updateAnalysisTable(data) {
        const tableBody = document.querySelector('#analysisDataTable tbody');
        tableBody.innerHTML = '';
        
        // Implementar atualização da tabela com os dados
        if (data.message) {
            tableBody.innerHTML = `<tr><td colspan="3">${data.message}</td></tr>`;
            return;
        }
        
        // Exemplo básico - adaptar conforme a estrutura dos dados
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
        // Implementar toggle entre gráficos
        this.showNotification(`Tipo de gráfico alterado para: ${this.currentChartType === 'line' ? 'Linha' : 'Barras'}`, 'info');
    }

    clearProductAnalysis() {
        this.productBarcodes = [''];
        this.selectedMarkets = [];
        this.updateBarcodeInputs();
        this.updateSelectedMarkets();
        
        const resultsElement = document.getElementById('analysisResults');
        resultsElement.style.display = 'none';
        
        // Limpar gráficos
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
            // Implementar exportação dos dados de análise
            this.showNotification('Exportação em desenvolvimento', 'info');
        } catch (error) {
            console.error('Erro ao exportar análise:', error);
            this.showNotification('Erro ao exportar dados', 'error');
        }
    }

    logPageAccess() {
        // Registrar acesso à página
        if (typeof logPageAccess === 'function') {
            logPageAccess('dashboard');
        }
    }

    async getSupabaseToken() {
        try {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token || null;
        } catch (error) {
            console.error('Erro ao obter token:', error);
            return null;
        }
    }
}

// Inicializar o dashboard quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    window.dashboard = new Dashboard();
});
