// cesta-comprar.js - Funcionalidade de compra de cesta básica por código de barras
// Com interface idêntica ao compare.html

let buyBasketModal;
let marketDetailsModal;

// Variáveis para controle de mercados
let allMarkets = [];
let filteredMarkets = [];
let selectedMarkets = new Set();

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modais
    buyBasketModal = document.getElementById('buyBasketModal');
    marketDetailsModal = document.getElementById('marketDetailsModal');
    
    // Fechar modais ao clicar no X
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    // Fechar modais ao clicar fora
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    });
    
    // Event listener para o formulário de comparação
    document.getElementById('btnCompareBasket').addEventListener('click', handleCompareBasket);
});

/**
 * Abre o modal de compra com a interface de seleção de mercados
 */
function openBuyBasketModal(basketId, basketName) {
    currentBasketId = parseInt(basketId);
    const basket = allBaskets.find(b => b.id === currentBasketId);
    
    if (basket) {
        currentBasketProducts = basket.produtos || [];
        document.getElementById('buyBasketName').textContent = basketName;
        
        // Verificar se há produtos com código de barras
        const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
        if (productsWithBarcode.length === 0) {
            showNotification('Esta cesta não possui produtos com código de barras para busca.', 'warning');
            return;
        }
        
        // Inicializar a interface de mercados
        initializeMarketsInterface();
        buyBasketModal.style.display = 'block';
    }
}

/**
 * Inicializa a interface de seleção de mercados (igual ao compare.html)
 */
async function initializeMarketsInterface() {
    // Elementos da interface
    const supermarketGrid = document.getElementById('supermarketGrid');
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedMarketsCount = document.getElementById('selectedMarketsCount');
    const btnCompareBasket = document.getElementById('btnCompareBasket');

    // Limpar seleções anteriores
    selectedMarkets.clear();
    filteredMarkets = [];

    try {
        // Carregar lista de mercados
        const response = await authenticatedFetch('/api/supermarkets/public');
        if (!response.ok) throw new Error('Falha ao carregar mercados');
        
        allMarkets = await response.json();
        renderMarketGrid(allMarkets);
        filteredMarkets = [...allMarkets];
        
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        showNotification('Erro ao carregar lista de mercados', 'error');
        return;
    }

    // Configurar event listeners
    function setupEventListeners() {
        // Busca em mercados
        marketSearch.addEventListener('input', debounce(filterMarkets, 300));
        clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
        
        // Seleção em massa
        selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
        deselectAllMarkets.addEventListener('click', clearMarketSelection);
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
        
        updateCompareButtonState();
    }

    function toggleMarketSelection(cnpj) {
        if (selectedMarkets.has(cnpj)) {
            selectedMarkets.delete(cnpj);
        } else {
            selectedMarkets.add(cnpj);
        }
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    function updateSelectionCount() {
        selectedMarketsCount.textContent = `${selectedMarkets.size} selecionados`;
        updateCompareButtonState();
    }

    function updateCompareButtonState() {
        const hasMarkets = selectedMarkets.size >= 1;
        const hasProductsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras).length > 0;
        
        btnCompareBasket.disabled = !(hasMarkets && hasProductsWithBarcode);
    }

    function filterMarkets() {
        const searchTerm = marketSearch.value.toLowerCase().trim();
        
        if (!searchTerm) {
            filteredMarkets = [...allMarkets];
        } else {
            filteredMarkets = allMarkets.filter(market => 
                market.nome.toLowerCase().includes(searchTerm) ||
                (market.endereco && market.endereco.toLowerCase().includes(searchTerm)) ||
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
    }

    function clearMarketSelection() {
        selectedMarkets.clear();
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    // Inicializar
    setupEventListeners();
    updateSelectionCount();
    updateCompareButtonState();
}

/**
 * Lida com a comparação de preços da cesta por código de barras
 */
async function handleCompareBasket() {
    const selectedCnpjs = Array.from(selectedMarkets);
    
    if (selectedCnpjs.length === 0) {
        showNotification('Selecione pelo menos um mercado para comparar', 'error');
        return;
    }
    
    if (currentBasketProducts.length === 0) {
        showNotification('A cesta selecionada não possui produtos.', 'warning');
        return;
    }
    
    // Verificar se há produtos com código de barras
    const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
    if (productsWithBarcode.length === 0) {
        showNotification('Nenhum produto na cesta possui código de barras para busca.', 'warning');
        return;
    }

    const btn = document.getElementById('btnCompareBasket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Comparando...';
    
    // Fechar modal
    buyBasketModal.style.display = 'none';
    
    // Mostrar área de resultados
    document.getElementById('resultsTitle').style.display = 'block';
    document.getElementById('realtimeResults').innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Buscando preços por código de barras em ${selectedCnpjs.length} mercado(s), aguarde...</p>
            <p><small>Produtos com código de barras: ${productsWithBarcode.length}</small></p>
        </div>
    `;
    
    try {
        // Buscar preços por código de barras
        const results = await searchBasketByBarcode(productsWithBarcode, selectedCnpjs);
        renderBasketComparison(results, selectedCnpjs, productsWithBarcode);
        
        showNotification('Comparação de preços concluída!', 'success');
        
    } catch (error) {
        console.error("Erro na comparação de cesta:", error);
        document.getElementById('realtimeResults').innerHTML = `
            <div class="result-message error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao comparar preços: ${error.message}</p>
            </div>
        `;
        showNotification(`Erro na comparação: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Comparar Cesta Básica';
    }
}

/**
 * Busca preços por código de barras para todos os produtos da cesta
 */
async function searchBasketByBarcode(products, selectedMarkets) {
    const allResults = [];
    
    // Para cada produto na cesta, buscar por código de barras
    for (const product of products) {
        if (product.codigo_barras) {
            try {
                const productResults = await fetchProductPrices(
                    product.codigo_barras, 
                    selectedMarkets
                );
                
                if (productResults && productResults.length > 0) {
                    // Adicionar informações do produto original
                    productResults.forEach(result => {
                        result.original_product_name = product.nome_produto;
                        result.original_barcode = product.codigo_barras;
                    });
                    
                    allResults.push(...productResults);
                }
            } catch (error) {
                console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
                // Continuar com os outros produtos mesmo se um falhar
            }
        }
    }
    
    return allResults;
}

/**
 * Busca preços para um produto específico por código de barras
 * (Função similar à do compare.js)
 */
async function fetchProductPrices(barcode, cnpjs) {
    try {
        const requestBody = { 
            produto: barcode, 
            cnpjs: cnpjs 
        };

        const response = await authenticatedFetch('/api/realtime-search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erro na requisição');
        }

        const data = await response.json();
        const results = data.results || [];

        // Filtrar apenas resultados que correspondem exatamente ao código de barras
        const exactMatches = results.filter(item => 
            item.codigo_barras && item.codigo_barras.toString() === barcode.toString()
        );

        return exactMatches;
        
    } catch (error) {
        console.error(`Erro na busca por código de barras ${barcode}:`, error);
        return [];
    }
}

/**
 * Renderiza os resultados da comparação da cesta
 */
function renderBasketComparison(results, selectedMarkets, productsWithBarcode) {
    const resultsElement = document.getElementById('realtimeResults');
    
    if (results.length === 0) {
        resultsElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Nenhum preço encontrado</h3>
                <p>Não foram encontrados preços para os produtos da cesta (com código de barras) nos mercados selecionados.</p>
                <p class="text-muted">Verifique se os códigos de barras estão corretos e se os mercados possuem estes produtos em estoque.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar resultados por mercado
    const resultsByMarket = {};
    const marketTotals = {};
    const productsFoundByMarket = {};
    const marketDetails = {};
    
    // Inicializar estruturas
    selectedMarkets.forEach(cnpj => {
        const market = allMarkets.find(m => m.cnpj === cnpj);
        if (market) {
            resultsByMarket[market.nome] = [];
            marketTotals[market.nome] = 0;
            productsFoundByMarket[market.nome] = new Set();
            marketDetails[market.nome] = market;
        }
    });
    
    // Processar resultados
    results.forEach(item => {
        const marketName = item.nome_supermercado;
        const price = item.preco_produto || 0;
        
        if (resultsByMarket[marketName]) {
            resultsByMarket[marketName].push(item);
            marketTotals[marketName] += price;
            productsFoundByMarket[marketName].add(item.original_product_name);
        }
    });
    
    // 1. Resumo da Comparação
    const summaryHtml = `
        <div class="results-summary">
            <h3><i class="fas fa-chart-bar"></i> Resumo da Comparação</h3>
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${results.length}</span>
                    <span class="stat-label">Preços Encontrados</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${Object.keys(resultsByMarket).length}</span>
                    <span class="stat-label">Mercados com Preços</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${productsWithBarcode.length}</span>
                    <span class="stat-label">Produtos com Código</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${selectedMarkets.length}</span>
                    <span class="stat-label">Mercados Selecionados</span>
                </div>
            </div>
        </div>
    `;
    
    // 2. Tabela de Comparação de Mercados (ordenada por preço total)
    const sortedMarkets = Object.entries(marketTotals)
        .sort(([, a], [, b]) => a - b)
        .filter(([, total]) => total > 0);
    
    let comparisonHtml = `
        <div class="table-container">
            <h3><i class="fas fa-trophy"></i> Melhores Ofertas por Mercado</h3>
            <table class="table">
                <thead>
                    <tr>
                        <th>Posição</th>
                        <th>Mercado</th>
                        <th>Total Estimado (R$)</th>
                        <th>Produtos Encontrados</th>
                        <th>Taxa de Sucesso</th>
                        <th>Status</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    sortedMarkets.forEach(([marketName, total], index) => {
        const productCount = productsFoundByMarket[marketName].size;
        const completionRate = productsWithBarcode.length > 0 ? 
            Math.round((productCount / productsWithBarcode.length) * 100) : 0;
        const isBest = index === 0;
        
        let statusClass = 'cancelada';
        let statusText = 'Ruim';
        
        if (completionRate >= 80) {
            statusClass = 'concluída';
            statusText = 'Ótimo';
        } else if (completionRate >= 50) {
            statusClass = 'em-andamento';
            statusText = 'Bom';
        }
        
        comparisonHtml += `
            <tr class="${isBest ? 'highlight' : ''}">
                <td>
                    ${index + 1}°
                    ${isBest ? '<i class="fas fa-crown text-warning" title="Melhor oferta"></i>' : ''}
                </td>
                <td><strong>${marketName}</strong></td>
                <td class="price ${isBest ? 'price-cheapest' : ''}">R$ ${total.toFixed(2)}</td>
                <td>
                    ${productCount} de ${productsWithBarcode.length}
                    <div class="progress" style="height: 6px; margin-top: 5px;">
                        <div class="progress-bar" style="width: ${completionRate}%"></div>
                    </div>
                </td>
                <td>${completionRate}%</td>
                <td>
                    <span class="status-badge ${statusClass}">
                        ${statusText}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline btn-view-details" data-market="${marketName}">
                        <i class="fas fa-list"></i> Detalhes
                    </button>
                </td>
            </tr>
        `;
    });
    
    comparisonHtml += `</tbody></table></div>`;
    
    // 3. Detalhes por Produto
    let detailsHtml = `
        <div class="table-container">
            <h3><i class="fas fa-list-ul"></i> Detalhes por Produto</h3>
            <table class="table">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Código</th>
                        <th>Melhor Preço</th>
                        <th>Mercado</th>
                        <th>Preço Médio</th>
                        <th>Economia</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Agrupar por produto original
    const productsWithPrices = {};
    
    // Coletar estatísticas por produto
    productsWithBarcode.forEach(product => {
        const productName = product.nome_produto;
        const productResults = results.filter(r => r.original_product_name === productName);
        
        if (productResults.length > 0) {
            const prices = productResults.map(p => p.preco_produto).filter(p => p);
            const minPrice = Math.min(...prices);
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            const bestOffer = productResults.find(p => p.preco_produto === minPrice);
            const economy = avgPrice - minPrice;
            
            productsWithPrices[productName] = {
                bestOffer,
                minPrice,
                avgPrice,
                economy,
                allOffers: productResults
            };
            
            detailsHtml += `
                <tr>
                    <td>${productName}</td>
                    <td><code>${product.codigo_barras}</code></td>
                    <td class="price price-cheapest">R$ ${minPrice.toFixed(2)}</td>
                    <td>${bestOffer?.nome_supermercado || 'N/A'}</td>
                    <td>R$ ${avgPrice.toFixed(2)}</td>
                    <td class="economy ${economy > 0 ? 'positive' : ''}">
                        ${economy > 0 ? `+R$ ${economy.toFixed(2)}` : '--'}
                    </td>
                </tr>
            `;
        } else {
            detailsHtml += `
                <tr class="text-muted">
                    <td>${productName}</td>
                    <td><code>${product.codigo_barras}</code></td>
                    <td colspan="4" class="text-center">Nenhum preço encontrado</td>
                </tr>
            `;
        }
    });
    
    detailsHtml += `</tbody></table></div>`;
    
    resultsElement.innerHTML = summaryHtml + comparisonHtml + detailsHtml;
    
    // Adicionar event listeners para os botões de detalhes
    resultsElement.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const marketName = e.target.closest('button').dataset.market;
            showMarketDetails(marketName, resultsByMarket[marketName], marketDetails[marketName]);
        });
    });
}

/**
 * Mostra detalhes de um mercado específico
 */
function showMarketDetails(marketName, products, marketInfo) {
    const content = document.getElementById('marketDetailsContent');
    
    let detailsHtml = `
        <h4><i class="fas fa-store"></i> ${marketName}</h4>
        ${marketInfo.endereco ? `<p><i class="fas fa-map-marker-alt"></i> ${marketInfo.endereco}</p>` : ''}
        
        <div class="market-stats">
            <div class="stat">
                <span class="stat-value">${products.length}</span>
                <span class="stat-label">Produtos Encontrados</span>
            </div>
            <div class="stat">
                <span class="stat-value">R$ ${products.reduce((sum, p) => sum + (p.preco_produto || 0), 0).toFixed(2)}</span>
                <span class="stat-label">Total</span>
            </div>
        </div>
        
        <h5>Produtos Encontrados:</h5>
        <table class="table">
            <thead>
                <tr>
                    <th>Produto</th>
                    <th>Preço (R$)</th>
                    <th>Unidade</th>
                    <th>Código</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Ordenar produtos por nome
    products.sort((a, b) => a.original_product_name.localeCompare(b.original_product_name));
    
    products.forEach(product => {
        detailsHtml += `
            <tr>
                <td>${product.original_product_name}</td>
                <td class="price">R$ ${(product.preco_produto || 0).toFixed(2)}</td>
                <td>${product.unidade || 'UN'}</td>
                <td><code>${product.codigo_barras || 'N/A'}</code></td>
            </tr>
        `;
    });
    
    detailsHtml += `</tbody></table>`;
    content.innerHTML = detailsHtml;
    marketDetailsModal.style.display = 'block';
}

/**
 * Função utilitária para debounce
 */
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
