// cesta-comprar.js - Funcionalidade de compra de cesta básica

let buyBasketModal;
let currentBuyBasketId = null;
let currentBuyBasketProducts = [];

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar modal de compra
    buyBasketModal = document.getElementById('buyBasketModal');
    
    // Fechar modal ao clicar no X
    document.querySelector('#buyBasketModal .close').addEventListener('click', () => {
        buyBasketModal.style.display = 'none';
    });
    
    // Fechar modal ao clicar fora
    window.addEventListener('click', (event) => {
        if (event.target === buyBasketModal) {
            buyBasketModal.style.display = 'none';
        }
    });
    
    // Event listener para o formulário de comparação
    document.getElementById('compareBasketForm').addEventListener('submit', handleCompareBasket);
    
    // Delegar eventos para os botões de compra
    document.getElementById('basketsList').addEventListener('click', handleBuyBasket);
});

/**
 * Lida com o clique no botão "Comprar" da cesta
 */
function handleBuyBasket(event) {
    const target = event.target.closest('button');
    if (!target) return;
    
    if (target.classList.contains('btn-buy-basket')) {
        const basketId = target.dataset.basketId;
        const basketName = target.dataset.basketName;
        
        if (!basketId) return;
        
        currentBuyBasketId = parseInt(basketId);
        const basket = allBaskets.find(b => b.id === currentBuyBasketId);
        
        if (basket) {
            currentBuyBasketProducts = basket.produtos || [];
            document.getElementById('buyBasketName').textContent = basketName;
            document.getElementById('selectedMarketsCount').textContent = '0 mercados selecionados';
            
            // Renderizar lista de mercados
            renderMarketsList();
            
            // Mostrar modal
            buyBasketModal.style.display = 'block';
        }
    }
}

/**
 * Renderiza a lista de mercados com checkboxes
 */
function renderMarketsList() {
    const marketsList = document.getElementById('marketsCheckboxList');
    marketsList.innerHTML = '';
    
    if (allSupermarkets.length === 0) {
        marketsList.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                Nenhum mercado cadastrado no sistema.
            </div>
        `;
        return;
    }
    
    allSupermarkets.forEach(market => {
        const marketHtml = `
            <div class="checkbox-item">
                <input type="checkbox" id="market-${market.cnpj}" value="${market.cnpj}" class="market-checkbox">
                <label for="market-${market.cnpj}">
                    <strong>${market.nome}</strong>
                    ${market.endereco ? `<br><small class="text-muted">${market.endereco}</small>` : ''}
                </label>
            </div>
        `;
        marketsList.innerHTML += marketHtml;
    });
    
    // Adicionar listener para atualizar contador
    marketsList.querySelectorAll('.market-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedMarketsCount);
    });
    
    updateSelectedMarketsCount();
}

/**
 * Atualiza o contador de mercados selecionados
 */
function updateSelectedMarketsCount() {
    const selectedCount = document.querySelectorAll('.market-checkbox:checked').length;
    document.getElementById('selectedMarketsCount').textContent = 
        `${selectedCount} mercado(s) selecionado(s)`;
}

/**
 * Lida com a comparação de preços da cesta
 */
async function handleCompareBasket(event) {
    event.preventDefault();
    
    const selectedMarkets = Array.from(document.querySelectorAll('.market-checkbox:checked'))
        .map(checkbox => checkbox.value);
    
    if (selectedMarkets.length === 0) {
        showNotification('Selecione pelo menos um mercado para comparar.', 'warning');
        return;
    }
    
    if (currentBuyBasketProducts.length === 0) {
        showNotification('A cesta selecionada não possui produtos.', 'warning');
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
            <p>Buscando preços pelos códigos de barras, aguarde...</p>
        </div>
    `;
    
    try {
        // Buscar preços por código de barras
        const results = await searchBasketByBarcode(currentBuyBasketProducts, selectedMarkets);
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
                allResults.push(...productResults);
            } catch (error) {
                console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
                // Continuar com os outros produtos mesmo se um falhar
            }
        } else {
            // Se não tem código de barras, buscar por nome
            try {
                const productResults = await searchProductByName(
                    product.nome_produto, 
                    selectedMarkets
                );
                allResults.push(...productResults);
            } catch (error) {
                console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
            }
        }
    }
    
    return allResults;
}

/**
 * Busca um produto específico por código de barras
 */
async function searchProductByBarcode(barcode, productName, markets) {
    const query = supabase.table('produtos').select('*, supermercados(endereco)')
        .eq('codigo_barras', barcode)
        .in('cnpj_supermercado', markets)
        .order('preco_produto', { ascending: true });
    
    const response = await asyncio.to_thread(() => query.execute());
    
    if (response.data && response.data.length > 0) {
        return response.data.map(item => ({
            ...item,
            search_method: 'barcode',
            original_product_name: productName
        }));
    }
    
    // Se não encontrou por código de barras, tentar por nome
    return await searchProductByName(productName, markets);
}

/**
 * Busca um produto por nome
 */
async function searchProductByName(productName, markets) {
    const termo_busca = `%${productName.toLowerCase().strip()}%`;
    const query = supabase.table('produtos').select('*, supermercados(endereco)')
        .ilike('nome_produto_normalizado', termo_busca)
        .in('cnpj_supermercado', markets)
        .order('preco_produto', { ascending: true })
        .limit(5); // Limitar a 5 resultados por produto
    
    const response = await asyncio.to_thread(() => query.execute());
    
    if (response.data) {
        return response.data.map(item => ({
            ...item,
            search_method: 'name',
            original_product_name: productName
        }));
    }
    
    return [];
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
                <p>Não foram encontrados preços para os produtos da cesta nos mercados selecionados.</p>
            </div>
        `;
        return;
    }
    
    // Agrupar resultados por mercado
    const resultsByMarket = {};
    const marketTotals = {};
    const productsFoundByMarket = {};
    
    // Inicializar estruturas
    selectedMarkets.forEach(cnpj => {
        const market = allSupermarkets.find(m => m.cnpj === cnpj);
        if (market) {
            resultsByMarket[market.nome] = [];
            marketTotals[market.nome] = 0;
            productsFoundByMarket[market.nome] = new Set();
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
                    <span class="stat-value">${currentBuyBasketProducts.length}</span>
                    <span class="stat-label">Produtos na Cesta</span>
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
                        <th>Status</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    sortedMarkets.forEach(([marketName, total], index) => {
        const productCount = productsFoundByMarket[marketName].size;
        const completionRate = (productCount / currentBuyBasketProducts.length) * 100;
        const isBest = index === 0;
        
        comparisonHtml += `
            <tr class="${isBest ? 'highlight' : ''}">
                <td>${index + 1}°</td>
                <td><strong>${marketName}</strong></td>
                <td class="price ${isBest ? 'price-cheapest' : ''}">R$ ${total.toFixed(2)}</td>
                <td>
                    ${productCount} de ${currentBuyBasketProducts.length}
                    <div class="progress" style="height: 6px; margin-top: 5px;">
                        <div class="progress-bar" style="width: ${completionRate}%"></div>
                    </div>
                </td>
                <td>
                    <span class="status-badge ${completionRate >= 80 ? 'concluída' : (completionRate >= 50 ? 'em-andamento' : 'cancelada')}">
                        ${completionRate >= 80 ? 'Ótimo' : (completionRate >= 50 ? 'Bom' : 'Ruim')}
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
    
    currentBuyBasketProducts.forEach(product => {
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
            showMarketDetails(marketName, resultsByMarket[marketName]);
        });
    });
}

/**
 * Mostra detalhes de um mercado específico
 */
function showMarketDetails(marketName, products) {
    const modal = document.getElementById('marketDetailsModal');
    const content = document.getElementById('marketDetailsContent');
    
    let detailsHtml = `
        <h4>${marketName} - ${products.length} produtos encontrados</h4>
        <table class="table">
            <thead>
                <tr>
                    <th>Produto</th>
                    <th>Preço (R$)</th>
                    <th>Unidade</th>
                    <th>Código</th>
                    <th>Método Busca</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    products.forEach(product => {
        detailsHtml += `
            <tr>
                <td>${product.nome_produto}</td>
                <td class="price">R$ ${(product.preco_produto || 0).toFixed(2)}</td>
                <td>${product.unidade || 'N/A'}</td>
                <td><code>${product.codigo_barras || 'N/A'}</code></td>
                <td>
                    <span class="status-badge ${product.search_method === 'barcode' ? 'concluída' : 'em-andamento'}">
                        ${product.search_method === 'barcode' ? 'Código' : 'Nome'}
                    </span>
                </td>
            </tr>
        `;
    });
    
    detailsHtml += `</tbody></table>`;
    content.innerHTML = detailsHtml;
    modal.style.display = 'block';
}
