// cesta.js
// Mantive a lógica principal, melhorei algumas interações de UI e visibilidade das seções de resultado

// Depende de 'auth.js' para as funções routeGuard e authenticatedFetch

let allBaskets = [];
let currentBasketId = null;
let currentBasketProducts = [];
let allSupermarkets = [];

// Modais
let createBasketModal, manageProductsModal, editProductModal;

document.addEventListener('DOMContentLoaded', async () => {
    await routeGuard('baskets');

    initializeModals();
    await fetchSupermarkets();
    await loadBaskets();

    document.getElementById('createBasketForm').addEventListener('submit', handleCreateBasket);
    document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
    document.getElementById('btnClearBasket').addEventListener('click', handleClearBasket);
    document.getElementById('btnSearchPrices').addEventListener('click', handleSearchPrices);
    document.getElementById('editProductForm').addEventListener('submit', handleEditProductSubmit);

    document.getElementById('btnCreateBasket').addEventListener('click', () => {
        createBasketModal.style.display = 'flex';
        createBasketModal.setAttribute('aria-hidden', 'false');
    });

    document.getElementById('basketsList').addEventListener('click', handleBasketActions);

    // Close buttons
    document.querySelectorAll('.close').forEach(closeBtn => {
        closeBtn.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
        });
    });

    // Close modals when clicking outside content
    window.addEventListener('click', function(event) {
        if (event.target.classList && event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
            event.target.setAttribute('aria-hidden', 'true');
        }
    });

    // Improve accessibility: toggle theme
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const pressed = document.body.classList.contains('light-mode');
            themeToggle.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        });
    }
});

function initializeModals() {
    createBasketModal = document.getElementById('createBasketModal');
    manageProductsModal = document.getElementById('manageProductsModal');
    editProductModal = document.getElementById('editProductModal');
}

async function fetchSupermarkets() {
    try {
        const response = await authenticatedFetch('/api/supermarkets/public');
        if (!response.ok) throw new Error('Falha ao carregar mercados');
        allSupermarkets = await response.json();
    } catch (error) {
        console.error("Erro ao carregar mercados:", error);
        showNotification('Erro ao carregar lista de supermercados.', 'error');
    }
}

async function loadBaskets() {
    try {
        const response = await authenticatedFetch('/api/baskets');
        if (!response.ok) throw new Error('Falha ao carregar cestas');
        allBaskets = await response.json();
        renderBaskets();
    } catch (error) {
        console.error("Erro ao carregar cestas:", error);
        document.getElementById('basketsList').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <h3>Não foi possível carregar suas cestas</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderBaskets() {
    const listElement = document.getElementById('basketsList');
    listElement.innerHTML = '';

    if (allBaskets.length === 0) {
        listElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-shopping-basket"></i>
                <h3>Nenhuma cesta encontrada</h3>
                <p>Você ainda não tem cestas básicas cadastradas. Crie uma!</p>
            </div>
        `;
        return;
    }

    // grid layout for cards
    const wrapper = document.createElement('div');
    wrapper.className = 'cards-grid';
    allBaskets.forEach(basket => {
        const productCount = (basket.produtos || []).length;
        const productsWithBarcode = (basket.produtos || []).filter(p => p.codigo_barras).length;

        const card = document.createElement('div');
        card.className = 'product-card-v2';
        card.innerHTML = `
            <div class="card-v2-header">
                <div>
                    <div class="product-v2-name">${basket.nome}</div>
                    <div class="small text-muted">ID: ${basket.id}</div>
                </div>
                <div class="product-badge badge-primary">${productCount}/25</div>
            </div>
            <div class="card-v2-body">
                <div class="detail-v2-item">
                    <div class="detail-v2-icon"><i class="fas fa-hashtag"></i></div>
                    <div class="detail-v2-text">
                        <div class="detail-v2-title">Identificador</div>
                        <div class="detail-v2-subtitle">ID: ${basket.id}</div>
                    </div>
                </div>
                <div class="detail-v2-item">
                    <div class="detail-v2-icon"><i class="fas fa-boxes"></i></div>
                    <div class="detail-v2-text">
                        <div class="detail-v2-title">${productCount} de 25 produtos</div>
                        <div class="detail-v2-subtitle">${productsWithBarcode} com código de barras</div>
                    </div>
                </div>
            </div>
            <div class="card-v2-actions">
                <button class="btn btn-outline btn-manage-products" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                    <i class="fas fa-edit"></i> Gerenciar
                </button>
                <button class="btn btn-primary btn-buy-basket" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                    <i class="fas fa-shopping-cart"></i> Comparar
                </button>
                <button class="btn btn-danger btn-delete-basket" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                    <i class="fas fa-trash"></i> Excluir
                </button>
            </div>
        `;
        wrapper.appendChild(card);
    });

    listElement.appendChild(wrapper);

    // limit create button
    const btnCreate = document.getElementById('btnCreateBasket');
    if (allBaskets.length >= 3) {
        btnCreate.disabled = true;
        btnCreate.innerHTML = '<i class="fas fa-ban"></i> Limite de 3 cestas atingido';
    } else {
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Nova Cesta';
    }
}

async function handleCreateBasket(event) {
    event.preventDefault();
    const basketName = document.getElementById('basketName').value.trim();
    const btn = document.getElementById('btnSaveNewBasket');

    if (!basketName) {
        showNotification('Por favor, informe um nome para a cesta.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando...';

    try {
        const response = await authenticatedFetch('/api/baskets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nome: basketName, produtos: [] })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao criar a cesta.');
        }

        showNotification('Cesta criada com sucesso!', 'success');

        createBasketModal.style.display = 'none';
        createBasketModal.setAttribute('aria-hidden', 'true');

        await loadBaskets();
        document.getElementById('createBasketForm').reset();
    } catch (error) {
        console.error("Erro ao criar cesta:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Criar Cesta';
    }
}

async function handleBasketActions(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const basketId = target.dataset.basketId;
    const basketName = target.dataset.basketName;

    if (!basketId) return;

    if (target.classList.contains('btn-manage-products')) {
        currentBasketId = parseInt(basketId);
        const basket = allBaskets.find(b => b.id === currentBasketId);
        if (basket) {
            currentBasketProducts = basket.produtos || [];
            document.getElementById('currentBasketName').textContent = basketName;
            renderProductsList();
            manageProductsModal.style.display = 'flex';
            manageProductsModal.setAttribute('aria-hidden', 'false');
        }
    } else if (target.classList.contains('btn-buy-basket')) {
        // delegate to cesta-comprar.js
        openBuyBasketModal(basketId, basketName);
    } else if (target.classList.contains('btn-delete-basket')) {
        if (confirm(`Tem certeza que deseja excluir a cesta "${basketName || basketId}"? Esta ação não pode ser desfeita.`)) {
            try {
                const response = await authenticatedFetch(`/api/baskets/${basketId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Falha ao excluir a cesta.');
                }

                showNotification('Cesta excluída com sucesso!', 'success');
                await loadBaskets();
            } catch (error) {
                console.error("Erro ao excluir cesta:", error);
                showNotification(`Erro: ${error.message}`, 'error');
            }
        }
    }
}

function renderProductsList() {
    const listElement = document.getElementById('productsList');
    listElement.innerHTML = '';

    document.getElementById('productCountAlert').textContent =
        `${currentBasketProducts.length} de 25 produtos.`;

    const btnAdd = document.getElementById('btnAddProduct');
    const inputName = document.getElementById('productName');
    if (currentBasketProducts.length >= 25) {
        btnAdd.disabled = true;
        inputName.disabled = true;
        btnAdd.innerHTML = '<i class="fas fa-ban"></i> Limite Atingido';
    } else {
        btnAdd.disabled = false;
        inputName.disabled = false;
        btnAdd.innerHTML = 'Adicionar';
    }

    if (currentBasketProducts.length === 0) {
        listElement.innerHTML = `
            <li class="list-group-item text-muted text-center">
                <i class="fas fa-inbox"></i><br>
                Nenhum produto adicionado à cesta.
            </li>
        `;
        return;
    }

    currentBasketProducts.forEach((product, index) => {
        const hasBarcode = !!product.codigo_barras;
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <div style="font-weight:700;">${index + 1}. ${product.nome_produto} ${hasBarcode ? '<i class="fas fa-barcode text-success" title="Possui código de barras"></i>' : '<i class="fas fa-exclamation-triangle text-warning" title="Sem código de barras"></i>'}</div>
                    <div class="small text-muted">${product.codigo_barras || 'Sem código de barras'}</div>
                </div>
                <div style="display:flex; gap:0.5rem; align-items:center;">
                    <button class="btn btn-outline btn-edit-product" data-product-index="${index}" title="Editar produto"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-remove-product" data-product-index="${index}" title="Remover produto"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
        listElement.appendChild(li);
    });

    listElement.querySelectorAll('.btn-remove-product').forEach(btn => {
        btn.addEventListener('click', handleRemoveProduct);
    });
    listElement.querySelectorAll('.btn-edit-product').forEach(btn => {
        btn.addEventListener('click', openEditProductModal);
    });
}

async function handleAddProduct(event) {
    event.preventDefault();

    const productName = document.getElementById('productName').value.trim();
    const productBarcode = document.getElementById('productBarcode').value.trim();
    const btn = document.getElementById('btnAddProduct');

    if (!productName || !currentBasketId) {
        showNotification('Por favor, informe o nome do produto.', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...';

    try {
        const newProduct = {
            nome_produto: productName,
            codigo_barras: productBarcode || null
        };

        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newProduct)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao adicionar produto.');
        }

        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;

        renderProductsList();
        document.getElementById('addProductForm').reset();

        await loadBaskets();

        showNotification('Produto adicionado com sucesso!', 'success');

    } catch (error) {
        console.error("Erro ao adicionar produto:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Adicionar';
    }
}

async function handleRemoveProduct(event) {
    const index = event.target.closest('button').dataset.productIndex;
    if (index === undefined || currentBasketId === null) return;

    const productName = currentBasketProducts[index].nome_produto;

    if (!confirm(`Deseja remover o produto "${productName}"?`)) return;

    try {
        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products/${index}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao remover produto.');
        }

        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;
        renderProductsList();
        await loadBaskets();

        showNotification('Produto removido com sucesso!', 'success');

    } catch (error) {
        console.error("Erro ao remover produto:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    }
}

function openEditProductModal(event) {
    const index = event.target.closest('button').dataset.productIndex;
    const product = currentBasketProducts[index];

    if (!product) return;

    document.getElementById('editProductIndex').value = index;
    document.getElementById('editProductName').value = product.nome_produto;
    document.getElementById('editProductBarcode').value = product.codigo_barras || '';

    editProductModal.style.display = 'flex';
    editProductModal.setAttribute('aria-hidden', 'false');
}

async function handleEditProductSubmit(event) {
    event.preventDefault();
    const index = document.getElementById('editProductIndex').value;
    const newName = document.getElementById('editProductName').value.trim();
    const newBarcode = document.getElementById('editProductBarcode').value.trim();

    if (!newName || currentBasketId === null) {
        showNotification('Por favor, informe o nome do produto.', 'warning');
        return;
    }

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        const updateData = {
            nome_produto: newName,
            codigo_barras: newBarcode || null
        };

        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products/${index}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao editar produto.');
        }

        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;

        editProductModal.style.display = 'none';
        editProductModal.setAttribute('aria-hidden', 'true');

        renderProductsList();

        showNotification('Produto atualizado com sucesso!', 'success');

    } catch (error) {
        console.error("Erro ao editar produto:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Salvar Alterações';
    }
}

async function handleClearBasket() {
    if (currentBasketId === null) return;

    if (!confirm('Tem certeza que deseja REMOVER TODOS os produtos desta cesta? Esta ação não pode ser desfeita.')) return;

    try {
        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao limpar a cesta.');
        }

        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;
        renderProductsList();

        showNotification('Cesta limpa com sucesso!', 'success');
        await loadBaskets();
    } catch (error) {
        console.error("Erro ao limpar cesta:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    }
}

async function handleSearchPrices() {
    if (currentBasketId === null || currentBasketProducts.length === 0) {
        showNotification('Adicione produtos à cesta antes de buscar os preços.', 'warning');
        return;
    }

    const cnpjs = allSupermarkets.map(m => m.cnpj);
    if (cnpjs.length === 0) {
        showNotification('Nenhum mercado cadastrado para realizar a busca.', 'warning');
        return;
    }

    manageProductsModal.style.display = 'none';
    manageProductsModal.setAttribute('aria-hidden', 'true');

    const btn = document.getElementById('btnSearchPrices');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

    document.getElementById('realtimeResults').innerHTML = `
        <div class="loader-container">
            <div class="loader"></div>
            <p>Buscando preços em tempo real, aguarde...</p>
        </div>
    `;
    document.getElementById('resultsTitle').style.display = 'block';

    try {
        const urlParams = new URLSearchParams();
        cnpjs.forEach(cnpj => urlParams.append('cnpjs', cnpj));

        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/realtime-prices?${urlParams.toString()}`, {
            method: 'POST'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao buscar preços.');
        }

        const data = await response.json();
        renderRealtimeResults(data.results || []);

        showNotification('Busca de preços concluída!', 'success');

    } catch (error) {
        console.error("Erro na busca em tempo real:", error);
        document.getElementById('realtimeResults').innerHTML = `
            <div class="result-message error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao buscar preços: ${error.message}</p>
            </div>
        `;
        showNotification(`Erro na busca: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Buscar Preços em Mercados';
    }
}

function renderRealtimeResults(results) {
    const resultsElement = document.getElementById('realtimeResults');

    if (results.length === 0) {
        resultsElement.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Nenhum preço encontrado</h3>
                <p>Nenhum preço encontrado para os produtos da cesta nos mercados selecionados.</p>
            </div>
        `;
        return;
    }

    // Agrupar por mercado e calcular totais
    const basketTotals = {};
    const productsByMarket = {};
    const marketSet = new Set();

    results.forEach(item => {
        const marketName = item.nome_supermercado || 'Desconhecido';
        const price = parseFloat(item.preco_produto) || 0;
        marketSet.add(marketName);

        if (!basketTotals[marketName]) {
            basketTotals[marketName] = 0;
            productsByMarket[marketName] = [];
        }

        basketTotals[marketName] += price;
        productsByMarket[marketName].push(item);
    });

    const summaryHtml = `
        <div class="results-summary">
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${results.length}</span>
                    <span class="stat-label">Preços Encontrados</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${marketSet.size}</span>
                    <span class="stat-label">Mercados Consultados</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${currentBasketProducts.length}</span>
                    <span class="stat-label">Produtos na Cesta</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${allSupermarkets.length}</span>
                    <span class="stat-label">Total de Mercados</span>
                </div>
            </div>
        </div>
    `;

    // Geração de tabela comparativa (ordenada)
    const sortedTotals = Object.entries(basketTotals).sort(([, a], [, b]) => a - b);
    let comparisonHtml = `
        <div class="results-section">
            <h3><i class="fas fa-chart-bar"></i> Comparação entre Mercados</h3>
            <div class="cards-grid">
    `;

    sortedTotals.forEach(([market, total], index) => {
        const productsFound = productsByMarket[market].length;
        const completion = Math.round((productsFound / currentBasketProducts.length) * 100);
        const isCheapest = index === 0;
        const isMostExpensive = index === sortedTotals.length - 1;
        const cardClass = isCheapest ? 'market-card cheapest' : (isMostExpensive ? 'market-card most-expensive' : 'market-card');

        comparisonHtml += `
            <div class="${cardClass}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:700;">${market}</div>
                    ${isCheapest ? '<div class="market-badge best-price"><i class="fas fa-trophy"></i> Melhor</div>' : ''}
                </div>
                <div style="margin-top:0.5rem;">
                    <div class="market-total">R$ ${total.toFixed(2)}</div>
                    <div class="small text-muted">${productsFound} de ${currentBasketProducts.length} produtos encontrados</div>
                </div>
                <div style="margin-top:0.75rem;">
                    <div class="progress" style="background:rgba(255,255,255,0.02); height:8px; border-radius:6px;">
                        <div class="progress-bar" style="width:${completion}%; background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; border-radius:6px;"></div>
                    </div>
                    <div class="small text-muted" style="margin-top:6px;">Cobertura: ${completion}%</div>
                </div>
            </div>
        `;
    });

    comparisonHtml += `</div></div>`;

    // Detalhes por produto (table)
    let detailHtml = `
        <div class="results-section">
            <h3><i class="fas fa-list"></i> Detalhes dos Produtos Encontrados</h3>
            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Produto</th>
                            <th>Mercado</th>
                            <th>Preço (R$)</th>
                            <th>Unidade</th>
                            <th>Código</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    results.sort((a, b) => {
        if (a.nome_produto < b.nome_produto) return -1;
        if (a.nome_produto > b.nome_produto) return 1;
        return (parseFloat(a.preco_produto) || 0) - (parseFloat(b.preco_produto) || 0);
    });

    results.forEach(item => {
        const minPrice = Math.min(...results.filter(p => p.nome_produto === item.nome_produto).map(p => parseFloat(p.preco_produto) || Infinity));
        const isCheapest = parseFloat(item.preco_produto || 0) === minPrice;

        detailHtml += `
            <tr>
                <td>${item.nome_produto}</td>
                <td>${item.nome_supermercado || 'N/A'}</td>
                <td class="price ${isCheapest ? 'price-cheapest' : ''}">R$ ${(parseFloat(item.preco_produto) || 0).toFixed(2)} ${isCheapest ? '<i class="fas fa-trophy"></i>' : ''}</td>
                <td>${item.unidade || 'N/A'}</td>
                <td><code>${item.codigo_barras || 'N/A'}</code></td>
            </tr>
        `;
    });

    detailHtml += `</tbody></table></div></div>`;

    resultsElement.innerHTML = summaryHtml + comparisonHtml + detailHtml;
}
 
function renderMarketsList() {
    const marketsList = document.getElementById('marketsCheckboxList');
    if (!marketsList) return;
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

    marketsList.querySelectorAll('.market-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', updateSelectedMarketsCount);
    });

    updateSelectedMarketsCount();
}

function updateSelectedMarketsCount() {
    const sl = document.querySelectorAll('.market-checkbox:checked').length;
    const el = document.getElementById('selectedMarketsCount');
    if (el) el.textContent = `${sl} mercado(s) selecionado(s)`;
}

function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas fa-${getNotificationIcon(type)}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.classList.add('show'), 80);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function getNotificationIcon(type) {
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    return icons[type] || 'info-circle';
}
