// cesta-comprar.js - VERSÃO AJUSTADA PARA O NOVO LAYOUT
// Mantive a lógica de busca por código de barras e melhorei renderização/responsividade

let buyBasketModal;
let marketDetailsModal;
let bestBasketModal;

let allMarkets = [];
let filteredMarkets = [];
let selectedMarkets = new Set();

document.addEventListener('DOMContentLoaded', () => {
    buyBasketModal = document.getElementById('buyBasketModal');
    marketDetailsModal = document.getElementById('marketDetailsModal');

    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
        });
    });

    window.addEventListener('click', function(event) {
        if (event.target.classList && event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
            event.target.setAttribute('aria-hidden', 'true');
        }
    });

    const btnCompare = document.getElementById('btnCompareBasket');
    if (btnCompare) btnCompare.addEventListener('click', handleCompareBasket);
});

/**
 * Abre modal de compra (seleção de mercados)
 */
function openBuyBasketModal(basketId, basketName) {
    currentBasketId = parseInt(basketId);
    const basket = allBaskets.find(b => b.id === currentBasketId);

    if (basket) {
        currentBasketProducts = basket.produtos || [];
        document.getElementById('buyBasketName').textContent = basketName;

        const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
        if (productsWithBarcode.length === 0) {
            showNotification('Esta cesta não possui produtos com código de barras para busca.', 'warning');
            return;
        }

        initializeMarketsInterface();
        buyBasketModal.style.display = 'flex';
        buyBasketModal.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Inicializa interface de seleção de mercados
 */
async function initializeMarketsInterface() {
    const supermarketGrid = document.getElementById('supermarketGrid');
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectedMarketsCount = document.getElementById('selectedMarketsCount');
    const btnCompareBasket = document.getElementById('btnCompareBasket');

    selectedMarkets.clear();
    filteredMarkets = [];

    try {
        const response = await authenticatedFetch('/api/supermarkets/public');
        if (!response.ok) throw new Error('Falha ao carregar mercados');

        allMarkets = await response.json();
        filteredMarkets = [...allMarkets];
        renderMarketGrid(allMarkets);
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        showNotification('Erro ao carregar lista de mercados', 'error');
        return;
    }

    function renderMarketGrid(markets) {
        if (!supermarketGrid) return;
        supermarketGrid.innerHTML = '';

        if (markets.length === 0) {
            supermarketGrid.innerHTML = '<div class="empty-state">Nenhum mercado encontrado</div>';
            return;
        }

        markets.forEach(market => {
            const card = document.createElement('div');
            card.className = `market-card ${selectedMarkets.has(market.cnpj) ? 'selected' : ''}`;
            card.setAttribute('data-cnpj', market.cnpj);
            card.innerHTML = `
                <div>
                    <div style="font-weight:700;">${market.nome}</div>
                    <div class="small text-muted">${market.endereco || 'Endereço não disponível'}</div>
                    <div class="small text-muted" style="margin-top:6px;">CNPJ: ${market.cnpj}</div>
                </div>
            `;
            card.addEventListener('click', () => toggleMarketSelection(market.cnpj));
            supermarketGrid.appendChild(card);
        });

        updateSelectionCount();
        updateCompareButtonState();
    }

    function toggleMarketSelection(cnpj) {
        if (selectedMarkets.has(cnpj)) selectedMarkets.delete(cnpj);
        else selectedMarkets.add(cnpj);
        renderMarketGrid(filteredMarkets);
    }

    function updateSelectionCount() {
        if (selectedMarketsCount) selectedMarketsCount.textContent = `${selectedMarkets.size} selecionados`;
    }

    function updateCompareButtonState() {
        const hasMarkets = selectedMarkets.size >= 1;
        const hasProductsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras).length > 0;
        if (btnCompareBasket) btnCompareBasket.disabled = !(hasMarkets && hasProductsWithBarcode);
    }

    function filterMarkets() {
        const term = (marketSearch.value || '').toLowerCase().trim();
        if (!term) filteredMarkets = [...allMarkets];
        else filteredMarkets = allMarkets.filter(m => (m.nome || '').toLowerCase().includes(term) || (m.endereco || '').toLowerCase().includes(term) || (m.cnpj || '').includes(term));
        renderMarketGrid(filteredMarkets);
    }

    function clearMarketSearchFilter() {
        if (!marketSearch) return;
        marketSearch.value = '';
        filterMarkets();
    }

    function selectAllFilteredMarkets() {
        filteredMarkets.forEach(m => selectedMarkets.add(m.cnpj));
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    function clearMarketSelection() {
        selectedMarkets.clear();
        updateSelectionCount();
        renderMarketGrid(filteredMarkets);
    }

    marketSearch && marketSearch.addEventListener('input', debounce(filterMarkets, 300));
    clearMarketSearch && clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
    selectAllMarkets && selectAllMarkets.addEventListener('click', selectAllFilteredMarkets);
    deselectAllMarkets && deselectAllMarkets.addEventListener('click', clearMarketSelection);

    updateSelectionCount();
    updateCompareButtonState();
}

/**
 * Compara preços por código de barras
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

    const productsWithBarcode = currentBasketProducts.filter(p => p.codigo_barras);
    if (productsWithBarcode.length === 0) {
        showNotification('Nenhum produto na cesta possui código de barras para busca.', 'warning');
        return;
    }

    const btn = document.getElementById('btnCompareBasket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Comparando...';

    buyBasketModal.style.display = 'none';
    buyBasketModal.setAttribute('aria-hidden', 'true');

    document.getElementById('resultsTitle').style.display = 'block';
    document.getElementById('realtimeResults').innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Buscando preços por código de barras em ${selectedCnpjs.length} mercado(s), aguarde...</p>
            <p><small>Produtos com código de barras: ${productsWithBarcode.length}</small></p>
        </div>
    `;

    try {
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
 * Busca preços por código de barras (varre cada produto)
 */
async function searchBasketByBarcode(products, selectedMarkets) {
    const allResults = [];

    for (const product of products) {
        if (!product.codigo_barras) continue;
        try {
            const productResults = await fetchProductPrices(product.codigo_barras, selectedMarkets);
            if (productResults && productResults.length > 0) {
                productResults.forEach(r => {
                    r.original_product_name = product.nome_produto;
                    r.original_barcode = product.codigo_barras;
                });
                allResults.push(...productResults);
            }
        } catch (error) {
            console.error(`Erro ao buscar produto ${product.nome_produto}:`, error);
        }
    }

    return allResults;
}

/**
 * Chama API de busca para um código de barras
 */
async function fetchProductPrices(barcode, cnpjs) {
    try {
        const requestBody = { produto: barcode, cnpjs: cnpjs };

        const response = await authenticatedFetch('/api/realtime-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Erro na requisição');
        }

        const data = await response.json();
        const results = data.results || [];

        const exactMatches = results.filter(item => item.codigo_barras && item.codigo_barras.toString() === barcode.toString());
        return exactMatches;
    } catch (error) {
        console.error(`Erro na busca por código de barras ${barcode}:`, error);
        return [];
    }
}

/**
 * Renderiza resultados com layout profissional (melhor cesta, cesta completa, demais)
 */
function renderBasketComparison(results, selectedMarkets, productsWithBarcode) {
    const resultsElement = document.getElementById('realtimeResults');

    if (results.length === 0) {
        resultsElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Nenhum preço encontrado</h3>
                <p>Não foram encontrados preços para os produtos da cesta (com código de barras) nos mercados selecionados.</p>
            </div>
        `;
        return;
    }

    // Agrupar por mercado
    const resultsByMarket = {};
    const marketTotals = {};
    const productsFoundByMarket = {};
    const marketDetails = {};
    const marketProductDetails = {};

    selectedMarkets.forEach(cnpj => {
        const market = allMarkets.find(m => m.cnpj === cnpj) || allSupermarkets.find(m => m.cnpj === cnpj);
        if (market) {
            resultsByMarket[market.nome] = [];
            marketTotals[market.nome] = 0;
            productsFoundByMarket[market.nome] = new Set();
            marketDetails[market.nome] = market;
            marketProductDetails[market.nome] = [];
        }
    });

    results.forEach(item => {
        const marketName = item.nome_supermercado || item.filial || 'Desconhecido';
        const price = parseFloat(item.preco_produto) || 0;
        const productKey = `${item.original_product_name}_${item.original_barcode}`;

        if (!resultsByMarket[marketName]) {
            resultsByMarket[marketName] = [];
            marketTotals[marketName] = 0;
            productsFoundByMarket[marketName] = new Set();
            marketProductDetails[marketName] = [];
        }

        if (!productsFoundByMarket[marketName].has(productKey)) {
            productsFoundByMarket[marketName].add(productKey);
            resultsByMarket[marketName].push(item);
            marketTotals[marketName] += price;
            marketProductDetails[marketName].push({...item, price});
        }
    });

    const bestBasket = calculateBestBasket(results, productsWithBarcode);
    const completeBasketMarket = findCompleteBasketMarket(marketTotals, productsFoundByMarket, productsWithBarcode);

    const sortedMarkets = Object.entries(marketTotals).sort(([, a], [, b]) => a - b).filter(([, total]) => total > 0);

    // Summary
    const summaryHtml = `
        <div class="results-summary">
            <div class="summary-stats">
                <div class="stat"><span class="stat-value">${results.length}</span><span class="stat-label">Preços Encontrados</span></div>
                <div class="stat"><span class="stat-value">${Object.keys(resultsByMarket).length}</span><span class="stat-label">Mercados com Preços</span></div>
                <div class="stat"><span class="stat-value">${productsWithBarcode.length}</span><span class="stat-label">Produtos com Código</span></div>
                <div class="stat"><span class="stat-value">${selectedMarkets.length}</span><span class="stat-label">Mercados Selecionados</span></div>
            </div>
        </div>
    `;

    // Best Basket Card
    let bestBasketHtml = '';
    if (bestBasket.products.length > 0) {
        bestBasketHtml = `
            <div class="results-section">
                <h3><i class="fas fa-crown text-warning"></i> Cesta Ideal (Otimizada)</h3>
                <div class="cards-grid">
                    <div class="market-card best-basket">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:700;">Cesta Otimizada</div>
                            <div class="market-badge best-price"><i class="fas fa-trophy"></i> Ideal</div>
                        </div>
                        <div style="margin-top:0.5rem;">
                            <div class="market-total">R$ ${bestBasket.total.toFixed(2)}</div>
                            <div class="small text-muted">${bestBasket.products.length} de ${productsWithBarcode.length} produtos encontrados</div>
                        </div>
                        <div style="margin-top:0.75rem;">
                            <div class="progress" style="background:rgba(255,255,255,0.02); height:8px; border-radius:6px;">
                                <div class="progress-bar" style="width:${Math.round((bestBasket.products.length/productsWithBarcode.length)*100)}%; background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; border-radius:6px;"></div>
                            </div>
                            <div class="small text-muted" style="margin-top:6px;">Cobertura: ${Math.round((bestBasket.products.length/productsWithBarcode.length)*100)}%</div>
                        </div>
                        <div style="margin-top:0.75rem;">
                            <button class="btn btn-outline btn-view-best-basket"><i class="fas fa-list"></i> Ver Detalhes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Complete basket card
    let completeBasketHtml = '';
    if (completeBasketMarket) {
        const marketName = completeBasketMarket.name;
        const total = completeBasketMarket.total;
        const productCount = completeBasketMarket.productCount;
        const market = marketDetails[marketName];
        completeBasketHtml = `
            <div class="results-section">
                <h3><i class="fas fa-award text-success"></i> Supermercado com Cesta Completa Mais Barata</h3>
                <div class="cards-grid">
                    <div class="market-card complete-basket">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:700;">${marketName}</div>
                            <div class="market-badge complete"><i class="fas fa-check-circle"></i> Completo</div>
                        </div>
                        <div style="margin-top:0.5rem;">
                            <div class="market-address small text-muted">${market ? (market.endereco || '') : ''}</div>
                            <div class="market-total">R$ ${total.toFixed(2)}</div>
                            <div class="small text-muted">${productCount} de ${productsWithBarcode.length} produtos</div>
                        </div>
                        <div style="margin-top:0.5rem;">
                            <button class="btn btn-outline btn-view-details" data-market="${marketName}"><i class="fas fa-list"></i> Ver Detalhes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Markets cards
    let marketsHtml = `
        <div class="results-section">
            <h3><i class="fas fa-store"></i> Comparação por Mercado</h3>
            <div class="cards-grid">
    `;

    sortedMarkets.forEach(([marketName, total], index) => {
        const productCount = (productsFoundByMarket[marketName] && productsFoundByMarket[marketName].size) || 0;
        const completionRate = Math.round((productCount / productsWithBarcode.length) * 100);
        const market = marketDetails[marketName] || {};
        const isCheapest = index === 0;
        const isMostExpensive = index === sortedMarkets.length - 1;

        if (completeBasketMarket && marketName === completeBasketMarket.name) return;

        let cardClass = 'market-card';
        if (isCheapest) cardClass += ' cheapest';
        if (isMostExpensive) cardClass += ' most-expensive';

        marketsHtml += `
            <div class="${cardClass}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700;">${marketName}</div>
                    ${isCheapest ? '<div class="market-badge best-price"><i class="fas fa-trophy"></i> Melhor Preço</div>' : ''}
                </div>
                <div style="margin-top:0.5rem;">
                    <div class="market-address small text-muted">${market.endereco || ''}</div>
                    <div class="market-total">R$ ${total.toFixed(2)}</div>
                    <div class="small text-muted">${productCount} de ${productsWithBarcode.length} produtos</div>
                </div>
                <div style="margin-top:0.6rem;">
                    <div class="progress" style="background:rgba(255,255,255,0.02); height:8px; border-radius:6px;">
                        <div class="progress-bar" style="width:${completionRate}%; background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; border-radius:6px;"></div>
                    </div>
                    <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
                        <div class="small text-muted">Cobertura: ${completionRate}%</div>
                        <button class="btn btn-outline btn-view-details" data-market="${marketName}"><i class="fas fa-list"></i> Ver Detalhes</button>
                    </div>
                </div>
            </div>
        `;
    });

    marketsHtml += `</div></div>`;

    resultsElement.innerHTML = summaryHtml + bestBasketHtml + completeBasketHtml + marketsHtml;

    // Attach actions
    resultsElement.querySelectorAll('.btn-view-details').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const marketName = e.currentTarget.dataset.market;
            showMarketDetails(marketName, marketProductDetails[marketName] || [], marketDetails[marketName] || {}, productsWithBarcode);
        });
    });

    resultsElement.querySelectorAll('.btn-view-best-basket').forEach(btn => {
        btn.addEventListener('click', () => {
            showBestBasketDetails(bestBasket, productsWithBarcode);
        });
    });
}

/**
 * Encontra mercado com cesta completa mais barata
 */
function findCompleteBasketMarket(marketTotals, productsFoundByMarket, productsWithBarcode) {
    let completeMarket = null;
    let lowestTotal = Infinity;

    Object.entries(marketTotals).forEach(([marketName, total]) => {
        const productCount = (productsFoundByMarket[marketName] && productsFoundByMarket[marketName].size) || 0;
        if (productCount === productsWithBarcode.length) {
            if (total < lowestTotal) {
                lowestTotal = total;
                completeMarket = { name: marketName, total: total, productCount: productCount };
            }
        }
    });

    return completeMarket;
}

/**
 * Calcula a melhor cesta (produto por produto com menor preço)
 */
function calculateBestBasket(results, productsWithBarcode) {
    const bestProducts = {};

    productsWithBarcode.forEach(product => {
        const productResults = results.filter(r => r.original_product_name === product.nome_produto && r.original_barcode === product.codigo_barras);
        if (productResults.length > 0) {
            const bestOffer = productResults.reduce((best, current) => {
                const cur = parseFloat(current.preco_produto) || 0;
                const b = parseFloat(best.preco_produto) || 0;
                return cur < b ? current : best;
            }, productResults[0]);
            bestProducts[product.nome_produto] = { ...bestOffer, price: parseFloat(bestOffer.preco_produto) || 0 };
        }
    });

    const bestProductsArray = Object.values(bestProducts);
    const total = bestProductsArray.reduce((sum, p) => sum + (p.price || 0), 0);

    return { products: bestProductsArray, total: total };
}

/**
 * Exibe detalhes do mercado (modal)
 */
function showMarketDetails(marketName, products, marketInfo, allProducts) {
    const content = document.getElementById('marketDetailsContent');
    if (!content) return;

    const total = products.reduce((sum, p) => sum + (p.price || 0), 0);
    const productCount = products.length;
    const totalProducts = allProducts.length;

    let html = `
        <div>
            <h4><i class="fas fa-store"></i> ${marketName}</h4>
            ${marketInfo.endereco ? `<p class="small text-muted"><i class="fas fa-map-marker-alt"></i> ${marketInfo.endereco}</p>` : ''}
            <div style="display:flex; gap:1rem; margin-top:0.75rem; flex-wrap:wrap;">
                <div class="market-stat"><div class="stat-value">${productCount}</div><div class="stat-label">Produtos Encontrados</div></div>
                <div class="market-stat"><div class="stat-value">${totalProducts}</div><div class="stat-label">Total na Cesta</div></div>
                <div class="market-stat"><div class="stat-value">R$ ${total.toFixed(2)}</div><div class="stat-label">Valor Total</div></div>
                <div class="market-stat"><div class="stat-value">${marketInfo.cnpj || 'N/A'}</div><div class="stat-label">CNPJ</div></div>
            </div>
        </div>
        <div style="margin-top:1rem;">
            <h5>Produtos Encontrados (${productCount} de ${totalProducts})</h5>
            <table class="table">
                <thead><tr><th>Produto</th><th>Código</th><th>Preço (R$)</th><th>Unidade</th><th>Última Venda</th></tr></thead>
                <tbody>
    `;

    products.sort((a, b) => (a.original_product_name || '').localeCompare(b.original_product_name || ''));

    products.forEach(product => {
        const lastSaleDate = product.data_ultima_venda ? new Date(product.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        html += `
            <tr>
                <td>${product.original_product_name} ${product.nome_produto !== product.original_product_name ? `<div class="small text-muted">(${product.nome_produto})</div>` : ''}</td>
                <td><code>${product.codigo_barras || 'N/A'}</code></td>
                <td class="price">R$ ${(product.price || 0).toFixed(2)}</td>
                <td>${product.unidade || 'UN'}</td>
                <td>${lastSaleDate}</td>
            </tr>
        `;
    });

    // missing
    const foundNames = products.map(p => p.original_product_name);
    const missing = allProducts.filter(p => !foundNames.includes(p.nome_produto));
    if (missing.length > 0) {
        html += `<tr class="section-divider"><td colspan="5"><strong>Produtos Não Encontrados neste Mercado:</strong></td></tr>`;
        missing.forEach(p => {
            html += `<tr class="text-muted"><td>${p.nome_produto}</td><td><code>${p.codigo_barras || 'N/A'}</code></td><td colspan="3" class="text-center">Produto não encontrado</td></tr>`;
        });
    }

    html += `</tbody></table></div>`;

    content.innerHTML = html;
    marketDetailsModal.style.display = 'flex';
    marketDetailsModal.setAttribute('aria-hidden', 'false');
}

/**
 * Exibe detalhes da melhor cesta (modal)
 */
function showBestBasketDetails(bestBasket, originalProducts) {
    if (!document.getElementById('bestBasketModal')) createBestBasketModal();
    const content = document.getElementById('bestBasketContent');

    let html = `
        <div>
            <h4><i class="fas fa-crown text-warning"></i> Melhor Cesta Básica</h4>
            <p class="small text-muted">Combinação dos produtos com menor preço entre os mercados selecionados</p>
            <div style="display:flex; gap:1rem; margin-top:0.75rem;">
                <div class="market-stat"><div class="stat-value">${bestBasket.products.length}</div><div class="stat-label">Produtos Otimizados</div></div>
                <div class="market-stat"><div class="stat-value">R$ ${bestBasket.total.toFixed(2)}</div><div class="stat-label">Valor Total</div></div>
                <div class="market-stat"><div class="stat-value">${originalProducts.length}</div><div class="stat-label">Total na Cesta</div></div>
            </div>
        </div>
        <div style="margin-top:1rem;">
            <h5>Produtos da Cesta Otimizada</h5>
            <table class="table">
                <thead><tr><th>Produto</th><th>Código</th><th>Melhor Preço (R$)</th><th>Mercado</th><th>Endereço</th><th>Última Venda</th></tr></thead>
                <tbody>
    `;

    bestBasket.products.sort((a,b) => (a.original_product_name||'').localeCompare(b.original_product_name||''));
    bestBasket.products.forEach(p => {
        const lastSaleDate = p.data_ultima_venda ? new Date(p.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        const market = allMarkets.find(m => m.nome === p.nome_supermercado) || allSupermarkets.find(m => m.nome === p.nome_supermercado);
        const marketAddress = market ? market.endereco : 'N/A';
        html += `
            <tr>
                <td>${p.original_product_name} ${p.nome_produto !== p.original_product_name ? `<div class="small text-muted">(${p.nome_produto})</div>` : ''}</td>
                <td><code>${p.codigo_barras || 'N/A'}</code></td>
                <td class="price price-cheapest">R$ ${(p.price || 0).toFixed(2)}</td>
                <td><strong>${p.nome_supermercado}</strong></td>
                <td>${marketAddress}</td>
                <td>${lastSaleDate}</td>
            </tr>
        `;
    });

    // missing
    const found = bestBasket.products.map(p=>p.original_product_name);
    const missing = originalProducts.filter(p => !found.includes(p.nome_produto));
    if (missing.length) {
        html += `<tr class="section-divider"><td colspan="6"><strong>Produtos Não Encontrados em Nenhum Mercado:</strong></td></tr>`;
        missing.forEach(p => {
            html += `<tr class="text-muted"><td>${p.nome_produto}</td><td><code>${p.codigo_barras || 'N/A'}</code></td><td colspan="4" class="text-center">Nenhum preço encontrado</td></tr>`;
        });
    }

    html += `</tbody></table></div>`;

    content.innerHTML = html;
    document.getElementById('bestBasketModal').style.display = 'flex';
    document.getElementById('bestBasketModal').setAttribute('aria-hidden', 'false');
}

function createBestBasketModal() {
    const modalHtml = `
        <div id="bestBasketModal" class="modal" aria-hidden="true">
            <div class="modal-content" style="max-width:1200px;" role="dialog" aria-modal="true">
                <div class="modal-header"><h5>Detalhes da Melhor Cesta Básica</h5><span class="close">&times;</span></div>
                <div class="modal-body"><div id="bestBasketContent"></div></div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('bestBasketModal').querySelector('.close').addEventListener('click', function() {
        document.getElementById('bestBasketModal').style.display = 'none';
        document.getElementById('bestBasketModal').setAttribute('aria-hidden', 'true');
    });
}

/* debounce util */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
