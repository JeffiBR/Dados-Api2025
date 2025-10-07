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
 * Renderiza os resultados da comparação da cesta em formato de cards
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

    // 1. CESTA BÁSICA IDEAL
    const idealBasket = createIdealBasket(results, productsWithBarcode);
    const idealBasketHtml = createIdealBasketCard(idealBasket, productsWithBarcode.length);
    
    // 2. RESUMO
    const summaryHtml = createComparisonSummary(results, resultsByMarket, productsWithBarcode);
    
    // 3. CARDS DOS MERCADOS
    const marketCardsHtml = createMarketCards(resultsByMarket, marketTotals, productsFoundByMarket, marketDetails, productsWithBarcode.length);
    
    resultsElement.innerHTML = idealBasketHtml + summaryHtml + marketCardsHtml;
    
    // Adicionar event listeners para os botões de detalhes
    resultsElement.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const marketName = e.target.closest('button').dataset.market;
            showMarketDetails(marketName, resultsByMarket[marketName], marketDetails[marketName]);
        });
    });
}

/**
 * Cria a cesta básica ideal com os melhores preços
 */
function createIdealBasket(results, productsWithBarcode) {
    const idealBasket = {};
    const bestPrices = {};
    
    // Encontrar o melhor preço para cada produto
    productsWithBarcode.forEach(product => {
        const productName = product.nome_produto;
        const productResults = results.filter(r => r.original_product_name === productName);
        
        if (productResults.length > 0) {
            const bestOffer = productResults.reduce((best, current) => {
                return (!best || (current.preco_produto || Infinity) < (best.preco_produto || Infinity)) ? current : best;
            }, null);
            
            if (bestOffer) {
                idealBasket[productName] = bestOffer;
                
                // Contar quantas vezes cada mercado aparece na cesta ideal
                const marketName = bestOffer.nome_supermercado;
                bestPrices[marketName] = (bestPrices[marketName] || 0) + 1;
            }
        }
    });
    
    return {
        products: idealBasket,
        bestPrices: bestPrices,
        total: Object.values(idealBasket).reduce((sum, item) => sum + (item.preco_produto || 0), 0)
    };
}

/**
 * Cria o card da cesta básica ideal
 */
function createIdealBasketCard(idealBasket, totalProducts) {
    const productCount = Object.keys(idealBasket.products).length;
    const completionRate = totalProducts > 0 ? Math.round((productCount / totalProducts) * 100) : 0;
    
    // Encontrar mercado mais frequente na cesta ideal
    const bestMarket = Object.entries(idealBasket.bestPrices)
        .sort(([,a], [,b]) => b - a)[0];
    
    return `
        <div class="card ideal-basket-card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fas fa-crown text-warning"></i>
                    <h3>Cesta Básica Ideal</h3>
                    <span class="badge best-price">Melhor Preço Total</span>
                </div>
                <div class="card-stats">
                    <div class="stat">
                        <span class="stat-value">R$ ${idealBasket.total.toFixed(2)}</span>
                        <span class="stat-label">Total Ideal</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${productCount}/${totalProducts}</span>
                        <span class="stat-label">Produtos</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${completionRate}%</span>
                        <span class="stat-label">Completude</span>
                    </div>
                </div>
            </div>
            <div class="card-content">
                <div class="ideal-basket-details">
                    <div class="ideal-market">
                        <strong>Mercado mais econômico:</strong>
                        ${bestMarket ? `${bestMarket[0]} (${bestMarket[1]} produtos)` : 'N/A'}
                    </div>
                    
                    <div class="products-grid">
                        ${Object.entries(idealBasket.products).map(([productName, product]) => `
                            <div class="product-card-mini">
                                <div class="product-name">${productName}</div>
                                <div class="product-details">
                                    <span class="product-price">R$ ${(product.preco_produto || 0).toFixed(2)}</span>
                                    <span class="product-market">${product.nome_supermercado}</span>
                                </div>
                                <div class="product-meta">
                                    <small>Código: ${product.codigo_barras || 'N/A'}</small>
                                    <small>Data: ${product.data_ultima_venda ? new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A'}</small>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Cria os cards dos mercados
 */
function createMarketCards(resultsByMarket, marketTotals, productsFoundByMarket, marketDetails, totalProducts) {
    // Ordenar mercados por preço total
    const sortedMarkets = Object.entries(marketTotals)
        .sort(([, a], [, b]) => a - b)
        .filter(([, total]) => total > 0);
    
    if (sortedMarkets.length === 0) {
        return '<div class="empty-state">Nenhum mercado com preços encontrados</div>';
    }
    
    return `
        <div class="market-cards-section">
            <h3><i class="fas fa-store"></i> Mercados Encontrados</h3>
            <div class="market-cards-grid">
                ${sortedMarkets.map(([marketName, total], index) => {
                    const products = resultsByMarket[marketName] || [];
                    const productCount = productsFoundByMarket[marketName]?.size || 0;
                    const completionRate = totalProducts > 0 ? Math.round((productCount / totalProducts) * 100) : 0;
                    const marketInfo = marketDetails[marketName];
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
                    
                    return `
                        <div class="market-card ${isBest ? 'highlight' : ''}">
                            <div class="market-card-header">
                                <div class="market-card-title">
                                    <h4>${marketName}</h4>
                                    ${isBest ? '<i class="fas fa-trophy best-market" title="Melhor oferta"></i>' : ''}
                                </div>
                                <div class="market-card-price">
                                    <span class="total-price">R$ ${total.toFixed(2)}</span>
                                    <span class="completion-rate">${completionRate}% completo</span>
                                </div>
                            </div>
                            
                            <div class="market-card-address">
                                <i class="fas fa-map-marker-alt"></i>
                                ${marketInfo?.endereco || 'Endereço não disponível'}
                            </div>
                            
                            <div class="market-card-stats">
                                <div class="market-stat">
                                    <span class="stat-value">${productCount}</span>
                                    <span class="stat-label">Produtos</span>
                                </div>
                                <div class="market-stat">
                                    <span class="stat-value">${products.length}</span>
                                    <span class="stat-label">Itens</span>
                                </div>
                                <div class="market-stat">
                                    <span class="status-badge ${statusClass}">${statusText}</span>
                                </div>
                            </div>
                            
                            <div class="market-card-products">
                                <h5>Produtos Encontrados:</h5>
                                <div class="products-list">
                                    ${products.slice(0, 5).map(product => `
                                        <div class="market-product-item">
                                            <div class="product-info">
                                                <span class="product-name">${product.original_product_name}</span>
                                                <span class="product-price">R$ ${(product.preco_produto || 0).toFixed(2)}</span>
                                            </div>
                                            <div class="product-meta">
                                                <small>Código: ${product.codigo_barras || 'N/A'}</small>
                                                <small>Data: ${product.data_ultima_venda ? new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A'}</small>
                                            </div>
                                        </div>
                                    `).join('')}
                                    ${products.length > 5 ? `
                                        <div class="more-products">
                                            + ${products.length - 5} outros produtos...
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                            
                            <div class="market-card-actions">
                                <button class="btn btn-outline btn-view-details" data-market="${marketName}">
                                    <i class="fas fa-list"></i> Ver Todos os Detalhes
                                </button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * Cria o resumo da comparação
 */
function createComparisonSummary(results, resultsByMarket, productsWithBarcode) {
    return `
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
                    <span class="stat-value">${allMarkets.length}</span>
                    <span class="stat-label">Total de Mercados</span>
                </div>
            </div>
        </div>
    `;
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
                    <th>Data</th>
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
                <td>${product.data_ultima_venda ? new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A'}</td>
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

/**
 * Exibe uma notificação para o usuário
 */
function showNotification(message, type = 'info') {
    // Remove notificação existente
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Mostrar notificação
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remover após 5 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

/**
 * Retorna o ícone apropriado para o tipo de notificação
 */
function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}
