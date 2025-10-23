// dashboard.js - Versão com dados reais e design elegante

class Dashboard {
    constructor() {
        this.dataService = new DashboardData();
        this.ui = new DashboardUI();
        this.charts = new Map();
        this.components = new Map();
        this.filters = {
            dateRange: '15',
            startDate: '',
            endDate: '',
            market: 'all'
        };

        this.currentAnalysisData = null;
        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Dashboard...');

        try {
            await this.initializeComponents();
            this.setupEventListeners();
            await this.loadInitialData();
            this.setupRealTimeUpdates();

            console.log('✅ Dashboard inicializado com sucesso');
        } catch (error) {
            console.error('❌ Erro na inicialização do dashboard:', error);
            this.ui.showNotification('Erro ao inicializar o dashboard', 'error');
        }
    }

    async initializeComponents() {
        // Inicializar componentes de UI
        await this.initializeMetrics();
        await this.initializeMarketSelector();
        await this.initializeBarcodeInputs();
        await this.initializeCharts();
    }

    async initializeMetrics() {
        // As métricas serão carregadas com dados reais
        console.log('✅ Métricas inicializadas');
    }

    async initializeMarketSelector() {
        const selectorContainer = document.getElementById('marketSelectorContainer');
        if (!selectorContainer) return;

        const marketSelector = this.ui.createMarketSelector({
            title: 'Selecionar Mercados para Análise',
            onChange: (selectedMarkets) => {
                this.filters.market = selectedMarkets.length > 0 ? selectedMarkets.join(',') : 'all';
                this.loadDashboardData();
            }
        });

        marketSelector.render(selectorContainer);
        this.components.set('marketSelector', marketSelector);

        // Carregar mercados
        try {
            const markets = await this.dataService.getMarkets();
            marketSelector.loadMarkets(markets);
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
        }
    }

    async initializeBarcodeInputs() {
        // Configurar inputs de código de barras
        this.setupBarcodeInputs();

        // Configurar checkboxes de mercados
        await this.setupMarketCheckboxes();
    }

    setupBarcodeInputs() {
        const addBtn = document.getElementById('addBarcode');
        const barcodeInputs = document.getElementById('barcodeInputs');

        if (!addBtn || !barcodeInputs) return;

        addBtn.addEventListener('click', () => {
            this.addBarcodeInput();
        });

        // Event delegation para remover inputs
        barcodeInputs.addEventListener('click', (e) => {
            if (e.target.closest('.remove-barcode')) {
                const btn = e.target.closest('.remove-barcode');
                const index = parseInt(btn.dataset.index);
                this.removeBarcodeInput(index);
            }
        });

        // Busca automática de produtos
        barcodeInputs.addEventListener('input', (e) => {
            if (e.target.classList.contains('barcode-input')) {
                const index = parseInt(e.target.dataset.index);
                const value = e.target.value.trim();

                if (value.length >= 8) {
                    this.searchProduct(value, index);
                }
            }
        });
    }

    async searchProduct(barcode, index) {
        try {
            const productInfo = await this.dataService.getProductInfo(barcode);
            if (productInfo) {
                this.showProductInfo(productInfo, index);
            }
        } catch (error) {
            console.error('Erro na busca do produto:', error);
        }
    }

    showProductInfo(productInfo, index) {
        const inputGroup = document.querySelector(`.barcode-input-group[data-index="${index}"]`);
        if (!inputGroup) return;

        let infoElement = inputGroup.querySelector('.product-info');
        if (!infoElement) {
            infoElement = document.createElement('div');
            infoElement.className = 'product-info';
            inputGroup.parentNode.insertBefore(infoElement, inputGroup.nextSibling);
        }

        infoElement.innerHTML = `
            <div class="product-name">${productInfo.nome_produto || 'Produto não encontrado'}</div>
            ${productInfo.tipo_unidade ? `<div class="product-unit">${productInfo.tipo_unidade}</div>` : ''}
        `;
    }

    addBarcodeInput() {
        const barcodeInputs = document.getElementById('barcodeInputs');
        if (!barcodeInputs) return;

        const currentInputs = barcodeInputs.querySelectorAll('.barcode-input-group');
        if (currentInputs.length >= 5) {
            this.ui.showNotification('Máximo de 5 produtos atingido', 'warning');
            return;
        }

        const index = currentInputs.length;
        const newInput = document.createElement('div');
        newInput.className = 'barcode-input-group';
        newInput.setAttribute('data-index', index);
        newInput.innerHTML = `
            <input type="text" class="barcode-input" placeholder="Digite o código de barras" data-index="${index}">
            <button class="btn small outline remove-barcode" data-index="${index}">
                <i class="fas fa-times"></i>
            </button>
        `;

        barcodeInputs.appendChild(newInput);

        // Mostrar botões de remoção em todos os inputs
        this.updateRemoveButtons();
    }

    removeBarcodeInput(index) {
        const barcodeInputs = document.getElementById('barcodeInputs');
        if (!barcodeInputs) return;

        const inputs = barcodeInputs.querySelectorAll('.barcode-input-group');
        if (inputs.length <= 1) return;

        // Remover elemento e seu product-info
        const inputToRemove = inputs[index];
        const infoElement = inputToRemove.nextElementSibling;
        if (infoElement && infoElement.classList.contains('product-info')) {
            infoElement.remove();
        }
        inputToRemove.remove();

        // Reindexar inputs restantes
        this.reindexBarcodeInputs();
        this.updateRemoveButtons();
    }

    reindexBarcodeInputs() {
        const barcodeInputs = document.getElementById('barcodeInputs');
        if (!barcodeInputs) return;

        const inputs = barcodeInputs.querySelectorAll('.barcode-input-group');
        inputs.forEach((input, index) => {
            input.setAttribute('data-index', index);
            const inputField = input.querySelector('.barcode-input');
            const removeBtn = input.querySelector('.remove-barcode');

            if (inputField) inputField.dataset.index = index;
            if (removeBtn) removeBtn.dataset.index = index;
        });
    }

    updateRemoveButtons() {
        const barcodeInputs = document.getElementById('barcodeInputs');
        if (!barcodeInputs) return;

        const inputs = barcodeInputs.querySelectorAll('.barcode-input-group');
        const removeButtons = barcodeInputs.querySelectorAll('.remove-barcode');

        // Mostrar/ocultar botões de remoção
        if (inputs.length > 1) {
            removeButtons.forEach(btn => btn.style.display = 'block');
        } else {
            removeButtons.forEach(btn => btn.style.display = 'none');
        }
    }

    async setupMarketCheckboxes() {
        try {
            const markets = await this.dataService.getMarkets();
            const container = document.getElementById('marketCheckboxes');

            if (!container) return;

            container.innerHTML = markets.map(market => `
                <div class="market-checkbox">
                    <input type="checkbox" id="market-${market.cnpj}" value="${market.cnpj}">
                    <label for="market-${market.cnpj}">${market.nome}</label>
                </div>
            `).join('');

            // Atualizar contador
            container.addEventListener('change', () => {
                this.updateSelectedMarketsCount();
            });

            this.updateSelectedMarketsCount();
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
        }
    }

    updateSelectedMarketsCount() {
        const container = document.getElementById('marketCheckboxes');
        const countElement = document.getElementById('selectedMarketsCount');

        if (!container || !countElement) return;

        const selected = container.querySelectorAll('input[type="checkbox"]:checked').length;
        countElement.textContent = selected;
    }

    async initializeCharts() {
        // Gráfico de produtos por mercado
        const productsByMarketChart = this.ui.createChart({
            id: 'productsByMarketChart',
            title: 'Produtos por Mercado',
            type: 'bar',
            size: 'large',
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `Produtos: ${context.parsed.y.toLocaleString('pt-BR')}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return value.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });

        this.charts.set('productsByMarket', productsByMarketChart);

        // Gráfico de tendência de preços
        const priceTrendChart = this.ui.createChart({
            id: 'priceTrendChart',
            title: 'Evolução de Preços',
            type: 'line',
            size: 'large',
            options: {
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return 'R$ ' + value.toFixed(2);
                            }
                        }
                    }
                }
            }
        });

        this.charts.set('priceTrend', priceTrendChart);
    }

    async loadInitialData() {
        this.updateDateRange();
        await this.loadDashboardData();
    }

    async loadDashboardData() {
        this.ui.showNotification('Carregando dados...', 'info', 2000);

        try {
            const [marketStats, productsByMarket, recentCollections] = await Promise.all([
                this.dataService.getMarketStats(),
                this.dataService.getProductsByMarket(this.filters.startDate, this.filters.endDate, this.filters.market),
                this.dataService.getRecentCollections(5)
            ]);

            this.updateMetrics(marketStats);
            this.updateProductsByMarketChart(productsByMarket);
            this.updateRecentCollections(recentCollections);

            this.ui.showNotification('Dados atualizados com sucesso', 'success', 3000);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.ui.showNotification('Erro ao carregar dados do dashboard', 'error');
        }
    }

    updateMetrics(stats) {
        // Atualizar métricas com dados reais
        document.getElementById('totalMarkets').textContent = stats.total_mercados?.toLocaleString('pt-BR') || '0';
        document.getElementById('totalProducts').textContent = stats.total_produtos?.toLocaleString('pt-BR') || '0';
        document.getElementById('totalCollections').textContent = stats.total_coletas?.toLocaleString('pt-BR') || '0';

        // Última coleta
        const lastCollectionElement = document.getElementById('lastCollection');
        if (stats.ultima_coleta) {
            const lastDate = new Date(stats.ultima_coleta);
            lastCollectionElement.textContent = lastDate.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else {
            lastCollectionElement.textContent = '--:--';
        }
    }

    updateProductsByMarketChart(data) {
        const chart = this.charts.get('productsByMarket');
        if (!chart || !data || data.length === 0) {
            this.showNoData('productsByMarketChart');
            return;
        }

        const labels = data.map(item => item.nome_supermercado);
        const values = data.map(item => item.total_produtos);

        chart.updateData({
            labels: labels,
            datasets: [{
                label: 'Total de Produtos',
                data: values,
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: 'rgba(99, 102, 241, 1)',
                borderWidth: 2,
                borderRadius: 4,
                format: 'integer'
            }]
        });
    }

    updateRecentCollections(collections) {
        const tableBody = document.querySelector('#recentActivityTable tbody');
        if (!tableBody) return;

        const activities = collections.ultimas_coletas || [];

        if (activities.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="no-data">Nenhuma atividade recente</td></tr>';
            return;
        }

        tableBody.innerHTML = activities.map(item => `
            <tr>
                <td>
                    <span class="status-badge success">Coleta</span>
                </td>
                <td>
                    <div class="activity-title">Coleta de preços</div>
                    <div class="activity-desc">${item.mercados_selecionados?.length || 0} mercados</div>
                </td>
                <td>${item.nomes_mercados?.join(', ') || 'Todos'}</td>
                <td>
                    <div class="activity-date">${new Date(item.iniciada_em).toLocaleDateString('pt-BR')}</div>
                    <div class="activity-time">${new Date(item.iniciada_em).toLocaleTimeString('pt-BR')}</div>
                </td>
                <td>
                    <span class="status-badge ${item.status === 'concluida' ? 'success' : 'warning'}">
                        ${item.status === 'concluida' ? 'Concluída' : 'Em andamento'}
                    </span>
                </td>
            </tr>
        `).join('');
    }

    showNoData(chartId) {
        const canvas = document.getElementById(chartId);
        if (!canvas) return;

        const container = canvas.parentElement;
        const noDataElement = document.createElement('div');
        noDataElement.className = 'no-data';
        noDataElement.textContent = 'Nenhum dado disponível para o período selecionado';

        // Remove existing no-data message
        const existingNoData = container.querySelector('.no-data');
        if (existingNoData) {
            existingNoData.remove();
        }

        container.appendChild(noDataElement);
    }

    setupEventListeners() {
        // Filtro de período
        const dateRange = document.getElementById('dateRange');
        if (dateRange) {
            dateRange.addEventListener('change', (e) => {
                this.filters.dateRange = e.target.value;
                if (e.target.value === 'custom') {
                    document.getElementById('customDateRange').style.display = 'flex';
                } else {
                    document.getElementById('customDateRange').style.display = 'none';
                    this.updateDateRange();
                    this.loadDashboardData();
                }
            });
        }

        // Aplicar filtros
        document.getElementById('applyFilters')?.addEventListener('click', () => {
            this.updateDateRange();
            this.loadDashboardData();
        });

        // Atualizar gráfico de produtos
        document.getElementById('refreshProducts')?.addEventListener('click', () => {
            this.loadProductsByMarketChart();
        });

        // Executar análise
        document.getElementById('runAnalysis')?.addEventListener('click', () => {
            this.runProductAnalysis();
        });

        // Limpar análise
        document.getElementById('clearAnalysis')?.addEventListener('click', () => {
            this.clearProductAnalysis();
        });

        // Exportar análise
        document.getElementById('exportAnalysis')?.addEventListener('click', () => {
            this.exportAnalysisData();
        });
    }

    setupRealTimeUpdates() {
        // Atualizar dados a cada 5 minutos
        setInterval(() => {
            this.loadDashboardData();
        }, 300000);

        // Atualizar métricas em tempo real a cada 30 segundos
        setInterval(() => {
            this.updateRealTimeMetrics();
        }, 30000);
    }

    async updateRealTimeMetrics() {
        try {
            const realTimeData = await this.dataService.getRealTimeStats();
            this.updateMetrics(realTimeData.marketStats);
        } catch (error) {
            console.error('Erro ao atualizar métricas em tempo real:', error);
        }
    }

    updateDateRange() {
        const days = parseInt(this.filters.dateRange);
        const endDate = new Date();
        const startDate = new Date();

        if (days && days > 0) {
            startDate.setDate(startDate.getDate() - days);
        } else {
            startDate.setDate(startDate.getDate() - 15); // padrão 15 dias
        }

        this.filters.startDate = startDate.toISOString().split('T')[0];
        this.filters.endDate = endDate.toISOString().split('T')[0];

        // Atualizar inputs de data personalizada se visíveis
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        if (startDateInput && endDateInput && this.filters.dateRange === 'custom') {
            this.filters.startDate = startDateInput.value;
            this.filters.endDate = endDateInput.value;
        }
    }

    async loadProductsByMarketChart() {
        try {
            const data = await this.dataService.getProductsByMarket(this.filters.startDate, this.filters.endDate, this.filters.market);
            this.updateProductsByMarketChart(data);
            this.ui.showNotification('Gráfico atualizado', 'success');
        } catch (error) {
            console.error('Erro ao carregar dados de produtos por mercado:', error);
            this.ui.showNotification('Erro ao atualizar gráfico', 'error');
        }
    }

    async runProductAnalysis() {
        // Obter códigos de barras
        const barcodes = this.getBarcodes();
        if (barcodes.length === 0) {
            this.ui.showNotification('Digite pelo menos um código de barras', 'warning');
            return;
        }

        // Obter mercados selecionados
        const markets = this.getSelectedMarkets();
        if (markets.length === 0) {
            this.ui.showNotification('Selecione pelo menos um mercado', 'warning');
            return;
        }

        // Obter período
        const period = document.getElementById('analysisPeriod').value;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(period));

        this.ui.showNotification('Executando análise...', 'info');

        try {
            const analysisData = await this.dataService.getProductBarcodeAnalysis({
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                product_barcodes: barcodes,
                markets_cnpj: markets
            });

            this.currentAnalysisData = analysisData;
            this.displayAnalysisResults(analysisData);
        } catch (error) {
            console.error('Erro na análise:', error);
            this.ui.showNotification('Erro ao executar análise', 'error');
        }
    }

    getBarcodes() {
        const inputs = document.querySelectorAll('.barcode-input');
        const barcodes = [];

        inputs.forEach(input => {
            if (input.value.trim() !== '') {
                barcodes.push(input.value.trim());
            }
        });

        return barcodes;
    }

    getSelectedMarkets() {
        const checkboxes = document.querySelectorAll('#marketCheckboxes input[type="checkbox"]:checked');
        const markets = [];

        checkboxes.forEach(checkbox => {
            markets.push(checkbox.value);
        });

        return markets;
    }

    displayAnalysisResults(data) {
        const resultsContainer = document.getElementById('analysisResults');
        if (!resultsContainer) return;

        // Mostrar container de resultados
        resultsContainer.style.display = 'block';

        // Atualizar gráfico de tendência
        this.updatePriceTrendChart(data);

        // Atualizar tabela de comparação
        this.updateComparisonTable(data);

        this.ui.showNotification('Análise concluída com sucesso', 'success');
    }

    updatePriceTrendChart(data) {
        const chart = this.charts.get('priceTrend');
        if (!chart || !data.results || data.results.length === 0) {
            this.showNoData('priceTrendChart');
            return;
        }

        // Agrupar dados por produto e mercado
        const groupedData = this.groupAnalysisData(data.results);

        // Criar datasets para o gráfico
        const datasets = [];
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

        Object.keys(groupedData).forEach((key, index) => {
            const [barcode, market] = key.split('|');
            const productData = groupedData[key];

            // Ordenar por data
            productData.sort((a, b) => new Date(a.data_coleta) - new Date(b.data_coleta));

            datasets.push({
                label: `${this.getProductName(data.results, barcode)} - ${market}`,
                data: productData.map(item => item.preco_produto),
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20',
                borderWidth: 3,
                tension: 0.4,
                fill: false
            });
        });

        // Criar labels de datas únicas
        const allDates = [...new Set(data.results.map(item => item.data_coleta))].sort();
        const labels = allDates.map(date => new Date(date).toLocaleDateString('pt-BR'));

        chart.updateData({
            labels: labels,
            datasets: datasets
        });
    }

    groupAnalysisData(results) {
        const grouped = {};

        results.forEach(item => {
            const key = `${item.codigo_barras}|${item.nome_supermercado}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });

        return grouped;
    }

    getProductName(results, barcode) {
        const product = results.find(item => item.codigo_barras === barcode);
        return product ? product.nome_produto : barcode;
    }

    updateComparisonTable(data) {
        const tableBody = document.querySelector('#comparisonDataTable tbody');
        if (!tableBody || !data.results) return;

        if (data.results.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="no-data">Nenhum resultado encontrado</td></tr>';
            return;
        }

        // Calcular preços médios para cada produto
        const averagePrices = this.calculateAveragePrices(data.results);

        tableBody.innerHTML = data.results.map(item => {
            const averagePrice = averagePrices[item.codigo_barras] || 0;
            const variation = averagePrice > 0 ? 
                ((item.preco_produto - averagePrice) / averagePrice) * 100 : 0;

            const variationClass = variation > 0 ? 'positive' : 
                                 variation < 0 ? 'negative' : 'neutral';

            return `
                <tr>
                    <td>${item.nome_produto}</td>
                    <td>${item.codigo_barras}</td>
                    <td>${item.nome_supermercado}</td>
                    <td>${new Date(item.data_coleta).toLocaleDateString('pt-BR')}</td>
                    <td class="price-cell">R$ ${item.preco_produto?.toFixed(2) || '0.00'}</td>
                    <td class="variation-cell ${variationClass}">
                        ${variation > 0 ? '+' : ''}${variation.toFixed(2)}%
                    </td>
                </tr>
            `;
        }).join('');
    }

    calculateAveragePrices(results) {
        const sums = {};
        const counts = {};

        results.forEach(item => {
            if (!sums[item.codigo_barras]) {
                sums[item.codigo_barras] = 0;
                counts[item.codigo_barras] = 0;
            }
            sums[item.codigo_barras] += item.preco_produto;
            counts[item.codigo_barras]++;
        });

        const averages = {};
        Object.keys(sums).forEach(barcode => {
            averages[barcode] = sums[barcode] / counts[barcode];
        });

        return averages;
    }

    clearProductAnalysis() {
        // Limpar inputs
        const inputs = document.querySelectorAll('.barcode-input');
        inputs.forEach((input, index) => {
            if (index === 0) {
                input.value = '';
            } else {
                const inputGroup = input.closest('.barcode-input-group');
                const infoElement = inputGroup.nextElementSibling;
                if (infoElement && infoElement.classList.contains('product-info')) {
                    infoElement.remove();
                }
                inputGroup.remove();
            }
        });

        // Limpar seleção de mercados
        const checkboxes = document.querySelectorAll('#marketCheckboxes input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        // Ocultar resultados
        const resultsContainer = document.getElementById('analysisResults');
        if (resultsContainer) {
            resultsContainer.style.display = 'none';
        }

        // Limpar product-info do primeiro input
        const firstInputGroup = document.querySelector('.barcode-input-group');
        if (firstInputGroup) {
            const infoElement = firstInputGroup.nextElementSibling;
            if (infoElement && infoElement.classList.contains('product-info')) {
                infoElement.remove();
            }
        }

        // Atualizar contador
        this.updateSelectedMarketsCount();
        this.updateRemoveButtons();

        this.ui.showNotification('Análise limpa', 'info');
    }

    async exportAnalysisData() {
        if (!this.currentAnalysisData) {
            this.ui.showNotification('Nenhum dado para exportar', 'warning');
            return;
        }

        try {
            const barcodes = this.getBarcodes();
            const markets = this.getSelectedMarkets();
            const period = document.getElementById('analysisPeriod').value;

            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(period));

            const blob = await this.dataService.exportAnalysisData({
                start_date: startDate.toISOString().split('T')[0],
                end_date: endDate.toISOString().split('T')[0],
                product_barcodes: barcodes,
                markets_cnpj: markets
            });

            this.downloadBlob(blob, `analise_produtos_${new Date().toISOString().split('T')[0]}.csv`);
            this.ui.showNotification('Dados exportados com sucesso', 'success');
        } catch (error) {
            console.error('Erro ao exportar dados:', error);
            this.ui.showNotification('Erro ao exportar dados', 'error');
        }
    }

    downloadBlob(blob, filename) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎯 Inicializando Dashboard...');
    window.dashboard = new Dashboard();
});