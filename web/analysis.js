document.addEventListener('DOMContentLoaded', () => {
    // Elementos principais
    const productInput = document.getElementById('productInput');
    const supermarketGrid = document.getElementById('supermarketGrid');
    const analyzeButton = document.getElementById('analyzeButton');
    const resultsContainer = document.getElementById('resultsContainer');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('emptyState');

    // Elementos do sumário
    const marketsAnalyzed = document.getElementById('marketsAnalyzed');
    const daysAnalyzed = document.getElementById('daysAnalyzed');
    const avgPrice = document.getElementById('avgPrice');
    const priceVariation = document.getElementById('priceVariation');

    // Elementos de data
    const startDate = document.getElementById('startDate');
    const endDate = document.getElementById('endDate');

    // Controles de mercado
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedCount = document.getElementById('selectedCount');

    // Gráficos
    let barChart = null;
    let lineChart = null;

    let allMarkets = [];
    let filteredMarkets = [];
    let selectedMarkets = new Set();
    let availableDates = [];
    let currentAnalysisData = null;

    // Inicialização
    initializePage();

    async function initializePage() {
        await loadSupermarkets();
        await loadAvailableDates();
        setupEventListeners();
        updateSelectionCount();
        updateAnalyzeButtonState();
    }

    async function loadSupermarkets() {
        try {
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados');

            allMarkets = await response.json();
            renderMarketGrid(allMarkets);
            filteredMarkets = [...allMarkets];
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showNotification('Erro ao carregar lista de mercados', 'error');
        }
    }

    async function loadAvailableDates() {
        try {
            console.log('🔐 Carregando datas disponíveis...');
            const response = await authenticatedFetch('/api/analysis/available-dates');

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Sessão expirada. Faça login novamente.');
                }
                throw new Error(`Falha ao carregar datas: ${response.status}`);
            }

            availableDates = await response.json();
            console.log('✅ Datas disponíveis carregadas:', availableDates);
            populateDateSelects();
        } catch (error) {
            console.error('❌ Erro ao carregar datas:', error);

            if (error.message.includes('Sessão expirada') || error.message.includes('401')) {
                showNotification('Sessão expirada. Redirecionando para login...', 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
            } else {
                showNotification('Erro ao carregar datas disponíveis', 'error');
            }
        }
    }

    function populateDateSelects() {
        // Limpar selects
        startDate.innerHTML = '<option value="">Selecione a data inicial</option>';
        endDate.innerHTML = '<option value="">Selecione a data final</option>';

        // Ordenar datas (mais recente primeiro)
        const sortedDates = [...availableDates].sort((a, b) => new Date(b) - new Date(a));

        sortedDates.forEach(date => {
            const dateObj = new Date(date);
            const formattedDate = dateObj.toLocaleDateString('pt-BR');

            const startOption = document.createElement('option');
            startOption.value = date;
            startOption.textContent = formattedDate;
            startDate.appendChild(startOption);

            const endOption = document.createElement('option');
            endOption.value = date;
            endOption.textContent = formattedDate;
            endDate.appendChild(endOption);
        });

        // Selecionar período padrão (últimos 7 dias, se disponível)
        if (sortedDates.length >= 7) {
            startDate.value = sortedDates[6];
            endDate.value = sortedDates[0];
        } else if (sortedDates.length > 0) {
            startDate.value = sortedDates[sortedDates.length - 1];
            endDate.value = sortedDates[0];
        }
    }

    function renderMarketGrid(markets) {
        supermarketGrid.innerHTML = '';

        if (markets.length === 0) {
            supermarketGrid.innerHTML = '<div class="empty-state">Nenhum mercado encontrado</div>';
            return;
        }

        markets.forEach(market => {
            const marketCard = document.createElement('div');
            marketCard.className = `market-card ${selectedMarkets.has(market.cnpj) ? 'selected' : ''}`;
            marketCard.innerHTML = `
                <div class="market-info">
                    <div class="market-name">${market.nome}</div>
                    <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
                </div>
            `;

            marketCard.addEventListener('click', () => toggleMarketSelection(market.cnpj));
            supermarketGrid.appendChild(marketCard);
        });
    }

    function toggleMarketSelection(cnpj) {
        if (selectedMarkets.has(cnpj)) {
            selectedMarkets.delete(cnpj);
        } else {
            selectedMarkets.add(cnpj);
        }
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
        updateAnalyzeButtonState();
    }

    function updateSelectionCount() {
        selectedCount.textContent = `${selectedMarkets.size} selecionados`;
    }

    function updateAnalyzeButtonState() {
        const hasProduct = productInput.value.trim().length > 0;
        const hasMarkets = selectedMarkets.size >= 1;
        const hasDates = startDate.value && endDate.value;

        analyzeButton.disabled = !(hasProduct && hasMarkets && hasDates);
    }

    function setupEventListeners() {
        // Validação de inputs
        productInput.addEventListener('input', debounce(validateInputs, 500));
        startDate.addEventListener('change', updateAnalyzeButtonState);
        endDate.addEventListener('change', updateAnalyzeButtonState);

        // Busca em mercados
        marketSearch.addEventListener('input', debounce(filterMarkets, 300));
        clearMarketSearch.addEventListener('click', clearMarketSearchFilter);

        // Seleção em massa
        selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
        deselectAllMarkets.addEventListener('click', clearMarketSelection);

        // Análise
        analyzeButton.addEventListener('click', performAnalysis);
    }

    function validateInputs() {
        const productText = productInput.value.trim();

        if (productText && productText.length < 2) {
            showNotification('Digite pelo menos 2 caracteres para o produto', 'warning');
        }

        updateAnalyzeButtonState();
    }

    function filterMarkets() {
        const searchTerm = marketSearch.value.toLowerCase().trim();

        if (!searchTerm) {
            filteredMarkets = [...allMarkets];
        } else {
            filteredMarkets = allMarkets.filter(market => 
                market.nome.toLowerCase().includes(searchTerm) ||
                market.cnpj.includes(searchTerm)
            );
        }

        renderMarketGrid(filteredMarkets);
    }

    function clearMarketSearchFilter() {
        marketSearch.value = '';
        filterMarkets();
    }

    function selectAllFilteredMarkets() {
        filteredMarkets.forEach(market => selectedMarkets.add(market.cnpj));
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
        updateAnalyzeButtonState();
    }

    function clearMarketSelection() {
        selectedMarkets.clear();
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
        updateAnalyzeButtonState();
    }

    async function performAnalysis() {
        const product = productInput.value.trim();
        const selectedCnpjs = Array.from(selectedMarkets);
        const startDateValue = startDate.value;
        const endDateValue = endDate.value;

        if (!product) {
            showNotification('Insira um produto para análise', 'error');
            return;
        }

        if (selectedCnpjs.length === 0) {
            showNotification('Selecione pelo menos um mercado', 'error');
            return;
        }

        if (!startDateValue || !endDateValue) {
            showNotification('Selecione o período de análise', 'error');
            return;
        }

        loader.style.display = 'flex';
        resultsContainer.style.display = 'none';
        emptyState.style.display = 'none';

        try {
            const requestBody = {
                product_identifier: product,
                cnpjs: selectedCnpjs,
                start_date: startDateValue,
                end_date: endDateValue
            };

            const response = await authenticatedFetch('/api/price-analysis', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro na análise');
            }

            const analysisData = await response.json();
            currentAnalysisData = analysisData;

            if (analysisData.bar_chart_data.length === 0 && analysisData.line_chart_data.length === 0) {
                loader.style.display = 'none';
                emptyState.style.display = 'block';
                showNotification('Nenhum dado encontrado para os critérios selecionados', 'warning');
                return;
            }

            updateSummary(analysisData);
            renderCharts(analysisData);
            renderDataTable(analysisData);

            resultsContainer.style.display = 'block';
            emptyState.style.display = 'none';

        } catch (error) {
            console.error('Erro na análise:', error);
            showNotification('Erro ao realizar análise', 'error');
        } finally {
            loader.style.display = 'none';
        }
    }

    function updateSummary(analysisData) {
        // Mercados analisados
        const uniqueMarkets = new Set();
        analysisData.line_chart_data.forEach(series => {
            uniqueMarkets.add(series.market);
        });
        marketsAnalyzed.textContent = uniqueMarkets.size;

        // Dias analisados
        const allDates = new Set();
        analysisData.line_chart_data.forEach(series => {
            series.data.forEach(point => {
                allDates.add(point.date);
            });
        });
        daysAnalyzed.textContent = allDates.size;

        // Preço médio
        let totalPrice = 0;
        let priceCount = 0;

        analysisData.bar_chart_data.forEach(item => {
            if (item.average_price > 0) {
                totalPrice += item.average_price;
                priceCount++;
            }
        });

        const average = priceCount > 0 ? totalPrice / priceCount : 0;
        avgPrice.textContent = `R$ ${average.toFixed(2)}`;

        // Variação de preço (simplificada)
        let minPrice = Infinity;
        let maxPrice = 0;

        analysisData.bar_chart_data.forEach(item => {
            if (item.average_price > 0) {
                minPrice = Math.min(minPrice, item.average_price);
                maxPrice = Math.max(maxPrice, item.average_price);
            }
        });

        const variation = minPrice !== Infinity && minPrice > 0 ? 
            ((maxPrice - minPrice) / minPrice) * 100 : 0;
        priceVariation.textContent = `${variation.toFixed(1)}%`;
    }

    function renderCharts(analysisData) {
        // Destruir gráficos existentes
        if (barChart) {
            barChart.destroy();
        }
        if (lineChart) {
            lineChart.destroy();
        }

        // Gráfico de barras
        const barCtx = document.getElementById('barChart').getContext('2d');
        barChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: analysisData.bar_chart_data.map(item => item.market),
                datasets: [{
                    label: 'Preço Médio (R$)',
                    data: analysisData.bar_chart_data.map(item => item.average_price),
                    backgroundColor: 'rgba(79, 70, 229, 0.7)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Comparação de Preços por Mercado'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Preço (R$)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Mercados'
                        }
                    }
                }
            }
        });

        // Gráfico de linha
        const lineCtx = document.getElementById('lineChart').getContext('2d');

        // Preparar dados para o gráfico de linha
        const allDates = [...new Set(analysisData.line_chart_data.flatMap(series => 
            series.data.map(point => point.date)
        ))].sort();

        const datasets = analysisData.line_chart_data.map((series, index) => {
            const colors = [
                'rgba(79, 70, 229, 1)',
                'rgba(239, 68, 68, 1)',
                'rgba(34, 197, 94, 1)',
                'rgba(249, 115, 22, 1)',
                'rgba(168, 85, 247, 1)'
            ];

            return {
                label: series.market,
                data: allDates.map(date => {
                    const point = series.data.find(p => p.date === date);
                    return point ? point.price : null;
                }),
                borderColor: colors[index % colors.length],
                backgroundColor: colors[index % colors.length] + '20',
                tension: 0.1,
                fill: false
            };
        });

        lineChart = new Chart(lineCtx, {
            type: 'line',
            data: {
                labels: allDates.map(date => new Date(date).toLocaleDateString('pt-BR')),
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolução de Preços ao Longo do Tempo'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Preço (R$)'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Data'
                        }
                    }
                }
            }
        });
    }

    function renderDataTable(analysisData) {
        const tableBody = document.querySelector('#analysisTable tbody');
        tableBody.innerHTML = '';

        // Coletar todos os dados em formato tabular
        const tableData = [];

        analysisData.line_chart_data.forEach(series => {
            series.data.forEach(point => {
                tableData.push({
                    date: point.date,
                    market: series.market,
                    price: point.price,
                    variation: point.variation || 0
                });
            });
        });

        // Ordenar por data (mais recente primeiro)
        tableData.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Preencher tabela
        tableData.forEach(row => {
            const tr = document.createElement('tr');

            const dateCell = document.createElement('td');
            dateCell.textContent = new Date(row.date).toLocaleDateString('pt-BR');

            const marketCell = document.createElement('td');
            marketCell.textContent = row.market;

            const priceCell = document.createElement('td');
            priceCell.textContent = `R$ ${row.price.toFixed(2)}`;
            priceCell.className = 'price-cell';

            const variationCell = document.createElement('td');
            const variation = row.variation;
            variationCell.textContent = `${variation > 0 ? '+' : ''}${variation.toFixed(1)}%`;
            variationCell.className = `variation-cell ${variation > 0 ? 'positive' : variation < 0 ? 'negative' : 'neutral'}`;

            tr.appendChild(dateCell);
            tr.appendChild(marketCell);
            tr.appendChild(priceCell);
            tr.appendChild(variationCell);

            tableBody.appendChild(tr);
        });
    }

    // Funções utilitárias
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, type === 'success' ? 3000 : 5000);
    }
});