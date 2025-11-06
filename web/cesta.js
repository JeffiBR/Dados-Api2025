// cesta.js
// Depende de 'auth.js' para as funções routeGuard e authenticatedFetch

// Variáveis de estado globais
let allBaskets = [];
let currentBasketId = null;
let currentBasketProducts = [];
let allSupermarkets = [];

// Modais
let createBasketModal, manageProductsModal, editProductModal;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Proteger a rota e exigir permissão 'baskets'
    await routeGuard('baskets');

    // 2. Inicializar modais
    initializeModals();

    // 3. Carregar lista de mercados (necessário para a busca de preços)
    await fetchSupermarkets();

    // 4. Carregar cestas do usuário
    await loadBaskets();

    // 5. Adicionar event listeners
    document.getElementById('createBasketForm').addEventListener('submit', handleCreateBasket);
    document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
    document.getElementById('btnClearBasket').addEventListener('click', handleClearBasket);
    document.getElementById('btnSearchPrices').addEventListener('click', handleSearchPrices);
    document.getElementById('editProductForm').addEventListener('submit', handleEditProductSubmit);

    // Botão para abrir modal de criação
    document.getElementById('btnCreateBasket').addEventListener('click', () => {
        createBasketModal.style.display = 'block';
    });

    // Usa delegação de evento para botões de Gerenciar/Excluir/Comparar nos cards
    document.getElementById('basketsList').addEventListener('click', handleBasketActions);

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
});

/**
 * Inicializa os modais da página
 */
function initializeModals() {
    createBasketModal = document.getElementById('createBasketModal');
    manageProductsModal = document.getElementById('manageProductsModal');
    editProductModal = document.getElementById('editProductModal');
}

/**
 * Carrega a lista de supermercados para o modal de busca de preços.
 */
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

/**
 * Carrega a lista de cestas básicas do usuário.
 */
async function loadBaskets() {
    try {
        // O backend cuida da permissão (usuário normal só vê as suas)
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

/**
 * Renderiza os cards das cestas na tela.
 */
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

    allBaskets.forEach(basket => {
        const productCount = (basket.produtos || []).length;
        const productsWithBarcode = (basket.produtos || []).filter(p => p.codigo_barras).length;

        const cardHtml = `
            <div class="product-card-v2">
                <div class="card-v2-header">
                    <div class="product-v2-name">${basket.nome}</div>
                </div>
                <div class="card-v2-body">
                    <div class="detail-v2-item">
                        <div class="detail-v2-icon">
                            <i class="fas fa-hashtag"></i>
                        </div>
                        <div class="detail-v2-text">
                            <div class="detail-v2-title">ID: ${basket.id}</div>
                            <div class="detail-v2-subtitle">Identificador único</div>
                        </div>
                    </div>
                    <div class="detail-v2-item">
                        <div class="detail-v2-icon">
                            <i class="fas fa-boxes"></i>
                        </div>
                        <div class="detail-v2-text">
                            <div class="detail-v2-title">${productCount} de 25 produtos</div>
                            <div class="detail-v2-subtitle">${productsWithBarcode} com código de barras</div>
                        </div>
                    </div>
                </div>
                <div class="card-v2-actions">
                    <button class="btn btn-outline btn-manage-products" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                        <i class="fas fa-edit"></i> Gerenciar Produtos
                    </button>
                    <button class="btn btn-success btn-buy-basket" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                        <i class="fas fa-shopping-cart"></i> Comparar
                    </button>
                    <button class="btn danger btn-delete-basket" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
        listElement.innerHTML += cardHtml;
    });

    // Gerenciar limite do botão de criação
    const btnCreate = document.getElementById('btnCreateBasket');
    if (allBaskets.length >= 3) {
        btnCreate.disabled = true;
        btnCreate.innerHTML = '<i class="fas fa-ban"></i> Limite de 3 cestas atingido';
    } else {
        btnCreate.disabled = false;
        btnCreate.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Nova Cesta';
    }
}

/**
 * Lida com o envio do formulário de criação de nova cesta.
 */
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

        // Fechar o modal
        createBasketModal.style.display = 'none';

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

/**
 * Lida com as ações de Gerenciar Produtos, Comparar e Excluir Cesta.
 */
async function handleBasketActions(event) {
    const target = event.target.closest('button');
    if (!target) return;

    const basketId = target.dataset.basketId;
    const basketName = target.dataset.basketName;

    if (!basketId) return;

    // Gerenciar Produtos
    if (target.classList.contains('btn-manage-products')) {
        currentBasketId = parseInt(basketId);
        const basket = allBaskets.find(b => b.id === currentBasketId);
        if (basket) {
            currentBasketProducts = basket.produtos || [];
            document.getElementById('currentBasketName').textContent = basketName;
            renderProductsList();
            manageProductsModal.style.display = 'block';
        }

    } 
    // Comparar Cesta
    else if (target.classList.contains('btn-buy-basket')) {
        openBuyBasketModal(basketId, basketName);
    }
    // Excluir Cesta
    else if (target.classList.contains('btn-delete-basket')) {
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

/**
 * Renderiza a lista de produtos dentro do modal de gerenciamento.
 */
function renderProductsList() {
    const listElement = document.getElementById('productsList');
    listElement.innerHTML = '';

    document.getElementById('productCountAlert').textContent = 
        `${currentBasketProducts.length} de 25 produtos.`;

    // Desabilitar adição se o limite for atingido
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
        const itemHtml = `
            <li class="list-group-item">
                <div class="product-item">
                    <div class="product-info">
                        <div class="product-name">
                            ${index + 1}. ${product.nome_produto}
                            ${hasBarcode ? '<i class="fas fa-barcode text-success" title="Possui código de barras"></i>' : '<i class="fas fa-exclamation-triangle text-warning" title="Sem código de barras"></i>'}
                        </div>
                        <div class="product-barcode">${product.codigo_barras || 'Sem código de barras'}</div>
                    </div>
                    <div class="product-actions">
                        <button class="btn-icon btn-edit-product" data-product-index="${index}" title="Editar produto">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon danger btn-remove-product" data-product-index="${index}" title="Remover produto">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </li>
        `;
        listElement.innerHTML += itemHtml;
    });

    // Adicionar listeners para os botões de produto recém-criados
    listElement.querySelectorAll('.btn-remove-product').forEach(btn => {
        btn.addEventListener('click', handleRemoveProduct);
    });
    listElement.querySelectorAll('.btn-edit-product').forEach(btn => {
        btn.addEventListener('click', openEditProductModal);
    });
}

/**
 * Adiciona um novo produto à cesta - VERSÃO CORRIGIDA
 */
async function handleAddProduct(event) {
    event.preventDefault();

    // LIMPEZA DOS DADOS - CORREÇÃO PARA COPY/PASTE
    let productName = document.getElementById('productName').value.trim();
    let productBarcode = document.getElementById('productBarcode').value.trim();

    // Limpar caracteres invisíveis e problemas comuns do copy/paste
    productName = cleanText(productName);
    productBarcode = cleanBarcode(productBarcode);

    const btn = document.getElementById('btnAddProduct');

    if (!productName || !currentBasketId) {
        showNotification('Por favor, informe o nome do produto.', 'warning');
        return;
    }

    // Verificar se já atingiu o limite
    if (currentBasketProducts.length >= 25) {
        showNotification('Limite de 25 produtos por cesta atingido.', 'warning');
        return;
    }

    // Validação adicional do código de barras
    if (productBarcode && !/^[0-9]{8,20}$/.test(productBarcode)) {
        showNotification('Código de barras deve conter apenas números (8-20 dígitos).', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...';

    try {
        const newProduct = { 
            nome_produto: productName, 
            codigo_barras: productBarcode || null 
        };

        console.log('📦 Tentando adicionar produto:', {
            nome: newProduct.nome_produto,
            codigo_barras: newProduct.codigo_barras,
            cesta: currentBasketId
        });

        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newProduct)
        });

        console.log('📡 Resposta do servidor:', {
            status: response.status,
            ok: response.ok
        });

        if (!response.ok) {
            let errorMessage = `Erro ${response.status}: Falha ao adicionar produto`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                // Se não conseguir parsear JSON, usa o texto da resposta
                const text = await response.text();
                if (text) errorMessage = text;
            }
            throw new Error(errorMessage);
        }

        const updatedBasket = await response.json();
        console.log('✅ Cesta atualizada com sucesso:', updatedBasket);

        // ATUALIZAÇÃO CRÍTICA
        currentBasketProducts = updatedBasket.produtos || [];

        // Atualizar UI
        renderProductsList();
        document.getElementById('addProductForm').reset();

        // Recarregar lista principal
        await loadBaskets();

        showNotification(`Produto "${productName}" adicionado com sucesso!`, 'success');

    } catch (error) {
        console.error('❌ Erro detalhado ao adicionar produto:', error);
        showNotification(`Erro ao adicionar produto: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Adicionar';
    }
}

/**
 * Limpa texto removendo caracteres invisíveis
 */
function cleanText(text) {
    return text
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
        .replace(/\s+/g, ' ') // Normaliza espaços múltiplos
        .trim();
}

/**
 * Limpa código de barras removendo caracteres não numéricos
 */
function cleanBarcode(barcode) {
    return barcode
        .replace(/[\u200B-\u200D\uFEFF\s-.]/g, '') // Remove espaços, hífens, pontos e caracteres invisíveis
        .replace(/[^\d]/g, '') // Remove qualquer coisa que não seja dígito
        .trim();
}

/**
 * Remove um produto da cesta usando seu índice.
 */
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

/**
 * Abre o modal de edição e carrega os dados do produto.
 */
function openEditProductModal(event) {
    const index = event.target.closest('button').dataset.productIndex;
    const product = currentBasketProducts[index];

    if (!product) return;

    document.getElementById('editProductIndex').value = index;
    document.getElementById('editProductName').value = product.nome_produto;
    document.getElementById('editProductBarcode').value = product.codigo_barras || '';

    editProductModal.style.display = 'block';
}

/**
 * Envia as alterações do produto para o backend.
 */
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
        // Aplicar mesma limpeza para edição
        const cleanName = cleanText(newName);
        const cleanBarcode = cleanBarcode(newBarcode);

        const updateData = { 
            nome_produto: cleanName, 
            codigo_barras: cleanBarcode || null 
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

        // Fechar o modal e atualizar lista
        editProductModal.style.display = 'none';
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

/**
 * Remove todos os produtos da cesta.
 */
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
        await loadBaskets(); // Atualiza a contagem no card
    } catch (error) {
        console.error("Erro ao limpar cesta:", error);
        showNotification(`Erro: ${error.message}`, 'error');
    }
}

/**
 * Inicia a busca de preços em tempo real para os produtos da cesta.
 */
async function handleSearchPrices() {
    if (currentBasketId === null || currentBasketProducts.length === 0) {
        showNotification('Adicione produtos à cesta antes de buscar os preços.', 'warning');
        return;
    }

    // Usaremos todos os mercados disponíveis
    const cnpjs = allSupermarkets.map(m => m.cnpj);
    if (cnpjs.length === 0) {
        showNotification('Nenhum mercado cadastrado para realizar a busca.', 'warning');
        return;
    }

    // Fecha o modal de gerenciamento de produtos
    manageProductsModal.style.display = 'none';

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
        // Envia a lista de CNPJs como query parameters
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

/**
 * Renderiza os resultados da busca em tempo real em uma tabela.
 */
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

    // Calcular o total de cada cesta
    const basketTotals = {};
    const productsByMarket = {};

    results.forEach(item => {
        const marketName = item.nome_supermercado;
        const price = item.preco_produto || 0;

        if (!basketTotals[marketName]) {
            basketTotals[marketName] = 0;
            productsByMarket[marketName] = [];
        }

        basketTotals[marketName] += price;
        productsByMarket[marketName].push(item);
    });

    // 1. Resumo da Cesta (Cards)
    const summaryHtml = `
        <div class="results-summary">
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${results.length}</span>
                    <span class="stat-label">Preços Encontrados</span>
                </div>
                <div class="stat">
                    <span class="stat-value">${Object.keys(basketTotals).length}</span>
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

    // 2. Tabela de Comparação de Mercados
    const sortedTotals = Object.entries(basketTotals).sort(([, a], [, b]) => a - b);
    let comparisonHtml = `
        <div class="table-container">
            <h3><i class="fas fa-chart-bar"></i> Comparação entre Mercados</h3>
            <table class="table">
                <thead>
                    <tr>
                        <th>Mercado</th>
                        <th>Total Estimado (R$)</th>
                        <th>Produtos Encontrados</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    sortedTotals.forEach(([market, total], index) => {
        const isCheapest = index === 0;
        const productCount = productsByMarket[market].length;
        comparisonHtml += `
            <tr class="${isCheapest ? 'highlight' : ''}">
                <td><strong>${market}</strong></td>
                <td class="price ${isCheapest ? 'price-cheapest' : ''}">R$ ${total.toFixed(2)}</td>
                <td>${productCount} de ${currentBasketProducts.length}</td>
                <td>
                    <span class="status-badge ${isCheapest ? 'concluída' : 'em-andamento'}">
                        ${isCheapest ? 'Melhor Preço' : 'Disponível'}
                    </span>
                </td>
            </tr>
        `;
    });

    comparisonHtml += `</tbody></table></div>`;

    // 3. Tabela de Detalhes dos Produtos
    let detailHtml = `
        <div class="table-container">
            <h3><i class="fas fa-list"></i> Detalhes dos Produtos Encontrados</h3>
            <table class="table">
                <thead>
                    <tr>
                        <th>Produto</th>
                        <th>Mercado</th>
                        <th>Preço (R$)</th>
                        <th>Unidade</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Ordena por nome do produto (para agrupar) e depois por preço
    results.sort((a, b) => {
        if (a.nome_produto < b.nome_produto) return -1;
        if (a.nome_produto > b.nome_produto) return 1;
        return (a.preco_produto || 0) - (b.preco_produto || 0);
    });

    results.forEach(item => {
        // Encontra o preço mínimo para este produto
        const minPrice = Math.min(...results
            .filter(p => p.nome_produto === item.nome_produto)
            .map(p => p.preco_produto || Infinity)
        );

        const isCheapest = item.preco_produto === minPrice;

        detailHtml += `
            <tr>
                <td>${item.nome_produto}</td>
                <td>${item.nome_supermercado || 'N/A'}</td>
                <td class="price ${isCheapest ? 'price-cheapest' : ''}">
                    ${(item.preco_produto || 0).toFixed(2)}
                    ${isCheapest ? '<i class="fas fa-trophy"></i>' : ''}
                </td>
                <td>${item.unidade || 'N/A'}</td>
            </tr>
        `;
    });

    detailHtml += `</tbody></table></div>`;

    resultsElement.innerHTML = summaryHtml + comparisonHtml + detailHtml;
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