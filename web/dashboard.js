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
            const { data: markets, error } = await supabase
                .from('supermercados')
                .select('cnpj, nome')
                .order('nome');

            if (error) throw error;

            this.marketsData = markets;

            const marketFilter = document.getElementById('marketFilter');
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
        const response = await fetch(`/api/dashboard/summary?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}`);
        if (!response.ok) throw new Error('Erro ao buscar resumo');
        return await response.json();
    }

    async fetchPriceTrends() {
        const response = await fetch(`/api/dashboard/price-trends?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}`);
        if (!response.ok) throw new Error('Erro ao buscar tendências');
        return await response.json();
    }

    async fetchTopProducts() {
        const response = await fetch(`/api/dashboard/top-products?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}&limit=10`);
        if (!response.ok) throw new Error('Erro ao buscar top produtos');
        return await response.json();
    }

    async fetchCategoryStats() {
        const response = await fetch(`/api/dashboard/category-stats?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}`);
        if (!response.ok) throw new Error('Erro ao buscar estatísticas por categoria');
        return await response.json();
    }

    async fetchBargains() {
        const response = await fetch(`/api/dashboard/bargains?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}&limit=10`);
        if (!response.ok) throw new Error('Erro ao buscar ofertas');
        return await response.json();
    }

    async fetchMarketComparison() {
        const response = await fetch(`/api/dashboard/market-comparison?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}`);
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
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
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
                            callback: (value) => `R$ ${value.toFixed(2)}`
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
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
                    borderWidth: 1
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
                        }
                    },
                    y: {
                        grid: {
                            display: false
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
                    borderColor: 'var(--card-bg)'
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
                            usePointStyle: true
                        }
                    }
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
                            color: 'var(--text-color)'
                        },
                        ticks: {
                            display: false,
                            beginAtZero: true
                        }
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
        chart.update();
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
        chart.update();
    }

    updateCategoryChart() {
        const chart = this.charts.categories;
        const categories = this.data.categories || [];
        
        chart.data.labels = categories.map(c => c.categoria);
        chart.data.datasets[0].data = categories.map(c => c.total_produtos);
        chart.update();
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
            pointBackgroundColor: colors[index]
        }));
        
        chart.update();
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
            const response = await fetch(`/api/dashboard/export-data?start_date=${this.filters.startDate}&end_date=${this.filters.endDate}&export_type=csv`);
            
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
        // Implementação básica de notificação
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: var(--border-radius);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1001;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transform: translateX(100%);
            transition: transform 0.3s ease;
        `;
        
        const icon = type === 'success' ? 'check-circle' : 
                    type === 'error' ? 'exclamation-circle' : 
                    type === 'warning' ? 'exclamation-triangle' : 'info-circle';
        
        notification.innerHTML = `
            <i class="fas fa-${icon}" style="color: ${type === 'success' ? 'var(--success-color)' : 
                                            type === 'error' ? 'var(--error-color)' : 
                                            type === 'warning' ? 'var(--warning-color)' : 'var(--info-color)'}"></i>
            <span>${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    // ===== NOVOS MÉTODOS PARA ANÁLISE DE PRODUTOS =====

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
        const marketCheckboxes = document.getElementById('marketCheckboxes');
        marketCheckboxes.innerHTML = '';

        this.marketsData.forEach(market => {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'market-checkbox';
            checkboxDiv.innerHTML = `
                <input type="checkbox" id="market_${market.cnpj}" value="${market.cnpj}">
                <label for="market_${market.cnpj}">${market.nome}</label>
            `;
            marketCheckboxes.appendChild(checkboxDiv);
        });

        // Event listener para checkboxes
        marketCheckboxes.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                this.updateSelectedMarkets();
            }
        });
    }

    updateSelectedMarkets() {
        const checkboxes = document.querySelectorAll('.market-checkbox input[type="checkbox"]:checked');
        this.selectedMarkets = Array.from(checkboxes).map(cb => cb.value);
        
        // Atualizar contador
        document.getElementById('selectedMarketsCount').textContent = this.selectedMarkets.length;
        
        // Limitar a 10 mercados
        if (this.selectedMarkets.length > 10) {
            this.showNotification('Máximo de 10 mercados permitidos', 'warning');
            // Desmarcar o último
            checkboxes[checkboxes.length - 1].checked = false;
            this.updateSelectedMarkets();
        }
    }

    updateDateRangeInfo() {
        const period = document.getElementById('analysisPeriod').value;
        const days = parseInt(period);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const dateInfo = document.getElementById('dateRangeInfo');
        dateInfo.textContent = `Período: ${startDate.toLocaleDateString('pt-BR')} à ${endDate.toLocaleDateString('pt-BR')}`;
    }

    async runProductAnalysis() {
        // Validar entradas
        const validBarcodes = this.productBarcodes.filter(barcode => barcode.trim() !== '');
        if (validBarcodes.length === 0) {
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
                product_barcodes: validBarcodes,
                markets_cnpj: this.selectedMarkets
            };

            const response = await fetch('/api/dashboard/product-barcode-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await this.getSupabaseToken()}`
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) throw new Error('Erro na análise');

            const analysisData = await response.json();

            if (analysisData.message) {
                this.showNotification(analysisData.message, 'info');
                return;
            }

            this.displayAnalysisResults(analysisData);

        } catch (error) {
            console.error('Erro na análise de produtos:', error);
            this.showNotification('Erro ao executar análise', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    displayAnalysisResults(data) {
        const resultsSection = document.getElementById('analysisResults');
        resultsSection.style.display = 'block';
        resultsSection.classList.add('fade-in');

        // Renderizar gráficos
        this.renderLineChart(data);
        this.renderBarChart(data);
        
        // Renderizar tabela
        this.renderAnalysisTable(data);
    }

    renderLineChart(data) {
        const ctx = document.getElementById('lineAnalysisChart').getContext('2d');
        
        // Destruir gráfico anterior se existir
        if (this.analysisCharts.line) {
            this.analysisCharts.line.destroy();
        }

        const datasets = this.createChartDatasets(data, 'line');
        
        this.analysisCharts.line = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates.map(date => new Date(date).toLocaleDateString('pt-BR')),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: R$ ${context.parsed.y.toFixed(2)}`;
                            }
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
                            callback: (value) => `R$ ${value.toFixed(2)}`
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.1)'
                        }
                    }
                }
            }
        });
    }

    renderBarChart(data) {
        const ctx = document.getElementById('barAnalysisChart').getContext('2d');
        
        if (this.analysisCharts.bar) {
            this.analysisCharts.bar.destroy();
        }

        const datasets = this.createChartDatasets(data, 'bar');
        
        this.analysisCharts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.dates.map(date => new Date(date).toLocaleDateString('pt-BR')),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: R$ ${context.parsed.y.toFixed(2)}`;
                            }
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
                            callback: (value) => `R$ ${value.toFixed(2)}`
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    createChartDatasets(data, type) {
        const colors = [
            '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#06b6d4', '#84cc16', '#f97316', '#64748b', '#ec4899'
        ];

        const datasets = [];
        let colorIndex = 0;

        Object.entries(data.products).forEach(([barcode, productName]) => {
            data.markets.forEach(market => {
                const key = `${barcode}_${market}`;
                const priceData = data.price_matrix[key];
                
                if (priceData) {
                    const marketName = this.getMarketName(market);
                    const dataPoints = data.dates.map(date => {
                        return priceData[date] || null;
                    });

                    datasets.push({
                        label: `${productName} - ${marketName}`,
                        data: dataPoints,
                        borderColor: colors[colorIndex % colors.length],
                        backgroundColor: type === 'bar' ? 
                            colors[colorIndex % colors.length] + '80' : 
                            colors[colorIndex % colors.length] + '20',
                        borderWidth: type === 'line' ? 2 : 1,
                        fill: type === 'line',
                        tension: 0.4
                    });

                    colorIndex++;
                }
            });
        });

        return datasets;
    }

    getMarketName(marketCnpj) {
        const market = this.marketsData.find(m => m.cnpj === marketCnpj);
        return market ? market.nome : `Mercado ${marketCnpj.substring(0, 8)}`;
    }

    renderAnalysisTable(data) {
        const table = document.getElementById('analysisDataTable');
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        
        // Limpar tabela
        thead.innerHTML = '';
        tbody.innerHTML = '';
        
        // Criar cabeçalho
        const headerRow = document.createElement('tr');
        headerRow.innerHTML = '<th>Data</th>';
        
        Object.entries(data.products).forEach(([barcode, productName]) => {
            data.markets.forEach(market => {
                const marketName = this.getMarketName(market);
                headerRow.innerHTML += `<th>${productName}<br><small>${marketName}</small></th>`;
            });
        });
        
        thead.appendChild(headerRow);
        
        // Criar linhas de dados
        data.dates.forEach(date => {
            const row = document.createElement('tr');
            const dateFormatted = new Date(date).toLocaleDateString('pt-BR');
            row.innerHTML = `<td>${dateFormatted}</td>`;
            
            Object.entries(data.products).forEach(([barcode, productName]) => {
                data.markets.forEach(market => {
                    const key = `${barcode}_${market}`;
                    const priceData = data.price_matrix[key];
                    const price = priceData ? priceData[date] : null;
                    
                    if (price) {
                        // Encontrar preço mínimo e máximo para destacar
                        const allPrices = this.getAllPricesForDate(data, date);
                        const minPrice = Math.min(...allPrices);
                        const maxPrice = Math.max(...allPrices);
                        
                        const cellClass = price === minPrice ? 'low' : price === maxPrice ? 'high' : '';
                        
                        row.innerHTML += `<td class="price-cell ${cellClass}">R$ ${price.toFixed(2)}</td>`;
                    } else {
                        row.innerHTML += '<td class="price-cell">-</td>';
                    }
                });
            });
            
            tbody.appendChild(row);
        });
    }

    getAllPricesForDate(data, date) {
        const prices = [];
        
        Object.entries(data.products).forEach(([barcode, productName]) => {
            data.markets.forEach(market => {
                const key = `${barcode}_${market}`;
                const priceData = data.price_matrix[key];
                if (priceData && priceData[date]) {
                    prices.push(priceData[date]);
                }
            });
        });
        
        return prices.length > 0 ? prices : [0];
    }

    clearProductAnalysis() {
        this.productBarcodes = [''];
        this.selectedMarkets = [];
        this.updateBarcodeInputs();
        this.updateSelectedMarkets();
        
        // Limpar checkboxes
        document.querySelectorAll('.market-checkbox input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
        
        // Esconder resultados
        document.getElementById('analysisResults').style.display = 'none';
        
        // Destruir gráficos
        if (this.analysisCharts.line) {
            this.analysisCharts.line.destroy();
            this.analysisCharts.line = null;
        }
        if (this.analysisCharts.bar) {
            this.analysisCharts.bar.destroy();
            this.analysisCharts.bar = null;
        }
        
        this.showNotification('Análise limpa com sucesso', 'success');
    }

    toggleChartType() {
        // Alternar entre gráficos de linha e barras
        const lineChart = document.getElementById('lineAnalysisChart').closest('.chart-wrapper');
        const barChart = document.getElementById('barAnalysisChart').closest('.chart-wrapper');
        
        const lineDisplay = lineChart.style.display;
        lineChart.style.display = lineDisplay === 'none' ? 'block' : 'none';
        barChart.style.display = lineDisplay === 'none' ? 'none' : 'block';
        
        this.showNotification('Tipo de gráfico alternado', 'info');
    }

    exportAnalysisData() {
        // Implementar exportação de dados da análise
        this.showNotification('Funcionalidade de exportação em desenvolvimento', 'info');
    }

    async getSupabaseToken() {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token;
    }

    async logPageAccess() {
        try {
            await fetch('/api/log-page-access', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await this.getSupabaseToken()}`
                },
                body: JSON.stringify({
                    page_key: 'dashboard'
                })
            });
        } catch (error) {
            console.error('Erro ao registrar acesso:', error);
        }
    }
}

// Inicializar dashboard quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new Dashboard();
});
