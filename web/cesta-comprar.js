// cesta-comprar.js - Funcionalidade de compra de cesta básica por código de barras

let buyBasketModal;
let marketDetailsModal;

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
    document.getElementById('compareBasketForm').addEventListener('submit', handleCompareBasket);
});

/**
 * Lida com a comparação de preços da cesta por código de barras
 */
async function handleCompareBasket(event) {
    event.preventDefault();
    
    const selectedMarkets = Array.from(document.querySelectorAll('.market-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedMarkets.length === 0) {
        showNotification('Selecione pelo menos um mercado para comparar.', 'warning');
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
            <p>Buscando preços pelos códigos de barras em ${selectedMarkets.length} mercado(s), aguarde...</p>
        </div>
    `;
    
    try {
        // Buscar preços por código de barras
        const results = await searchBasketByBarcode(currentBasketProducts, selectedMarkets);
        renderBasketComparison(results, selectedMarkets);
        
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
                const productResults = await searchProductByBarcode(
                    product.codigo_barras, 
                    product.nome_produto, 
                    selectedMarkets
                );
                
                // Marcar o produto original para referência
                productResults.forEach(result => {
                    result.original_product_name = product.nome_produto;
                    result.original_barcode = product.codigo_barras;
                });
                
                allResults.push(...productResults);
            } catch (error) {
                console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
                // Continuar com os outros produtos mesmo se um falhar
            }
        }
    }
    
    return allResults;
}

/**
 * Busca um produto específico por código de barras
 */
async function searchProductByBarcode(barcode, productName, markets) {
    try {
        // Fazer busca usando a API existente de busca
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(barcode)}&cnpjs=${markets.join(',')}`);
        
        if (!response.ok) {
            throw new Error(`Falha ao buscar produto por código de barras: ${barcode}`);
        }
        
        const data = await response.json();
        
        // Filtrar apenas resultados que correspondem exatamente ao código de barras
        const exactMatches = data.results.filter(item => 
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
function renderBasketComparison(results, selectedMarkets) {
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
        const market = allSupermarkets.find(m => m.cnpj === cnpj);
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
    
    // Produtos com código de barras na cesta
    const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
    
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
    const productStats = {};
    
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
