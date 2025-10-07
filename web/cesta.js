// cesta.js
// Depende de 'auth.js' para as funções routeGuard e authenticatedFetch

// Variáveis de estado globais
let allBaskets = [];
let currentBasketId = null;
let currentBasketProducts = [];
let allSupermarkets = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Proteger a rota e exigir permissão 'baskets'
    await routeGuard('baskets');
    
    // 2. Carregar lista de mercados (necessário para a busca de preços)
    await fetchSupermarkets();

    // 3. Carregar cestas do usuário
    await loadBaskets();
    
    // 4. Adicionar event listeners
    document.getElementById('createBasketForm').addEventListener('submit', handleCreateBasket);
    document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
    document.getElementById('btnClearBasket').addEventListener('click', handleClearBasket);
    document.getElementById('btnSearchPrices').addEventListener('click', handleSearchPrices);
    document.getElementById('editProductForm').addEventListener('submit', handleEditProductSubmit);
    // Usa delegação de evento para botões de Gerenciar/Excluir nos cards
    document.getElementById('basketsList').addEventListener('click', handleBasketActions);
});

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
        alert('Erro ao carregar lista de supermercados.');
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
        document.getElementById('basketsList').innerHTML = '<p class="text-danger">Não foi possível carregar suas cestas.</p>';
    }
}

/**
 * Renderiza os cards das cestas na tela.
 */
function renderBaskets() {
    const listElement = document.getElementById('basketsList');
    listElement.innerHTML = '';
    
    if (allBaskets.length === 0) {
        listElement.innerHTML = '<div class="col-12"><p>Você ainda não tem cestas básicas cadastradas. Crie uma!</p></div>';
        return;
    }

    allBaskets.forEach(basket => {
        const productCount = (basket.produtos || []).length;
        const cardHtml = `
            <div class="col-md-4 mb-4">
                <div class="card shadow-sm">
                    <div class="card-body">
                        <h5 class="card-title">${basket.nome}</h5>
                        <p class="card-text small text-muted">ID: ${basket.id} | Produtos: ${productCount} de 25</p>
                        <div class="btn-group w-100" role="group">
                            <button class="btn btn-sm btn-info btn-manage-products" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">Gerenciar Produtos</button>
                            <button class="btn btn-sm btn-danger btn-delete-basket" data-basket-id="${basket.id}" data-basket-name="${basket.nome}">Excluir Cesta</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        listElement.innerHTML += cardHtml;
    });

    // Gerenciar limite do botão de criação
    const btnCreate = document.getElementById('btnCreateBasket');
    if (allBaskets.length >= 3) {
        btnCreate.disabled = true;
        btnCreate.textContent = `Limite de 3 cestas atingido.`;
    } else {
        btnCreate.disabled = false;
        btnCreate.textContent = 'Criar Nova Cesta';
    }
}

/**
 * Lida com o envio do formulário de criação de nova cesta.
 */
async function handleCreateBasket(event) {
    event.preventDefault();
    const basketName = document.getElementById('basketName').value.trim();
    const btn = document.getElementById('btnSaveNewBasket');
    
    if (!basketName) return;
    
    btn.disabled = true;
    btn.textContent = 'Criando...';

    try {
        const response = await authenticatedFetch('/api/baskets', {
            method: 'POST',
            body: JSON.stringify({ nome: basketName, produtos: [] })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao criar a cesta.');
        }
        
        alert('Cesta criada com sucesso!');
        // Fechar o modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('createBasketModal'));
        if (modal) modal.hide();
        
        await loadBaskets();
        document.getElementById('createBasketForm').reset();
    } catch (error) {
        console.error("Erro ao criar cesta:", error);
        alert(`Erro: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Criar Cesta';
    }
}

/**
 * Lida com as ações de Gerenciar Produtos e Excluir Cesta.
 */
async function handleBasketActions(event) {
    const target = event.target;
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
            const modal = new bootstrap.Modal(document.getElementById('manageProductsModal'));
            modal.show();
        }
        
    } 
    // Excluir Cesta
    else if (target.classList.contains('btn-delete-basket')) {
        if (confirm(`Tem certeza que deseja excluir a cesta "${basketName || basketId}"?`)) {
            try {
                const response = await authenticatedFetch(`/api/baskets/${basketId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Falha ao excluir a cesta.');
                }

                alert('Cesta excluída com sucesso!');
                await loadBaskets();
            } catch (error) {
                console.error("Erro ao excluir cesta:", error);
                alert(`Erro: ${error.message}`);
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
        btnAdd.textContent = 'Limite Atingido';
    } else {
        btnAdd.disabled = false;
        inputName.disabled = false;
        btnAdd.textContent = 'Adicionar';
    }

    if (currentBasketProducts.length === 0) {
        listElement.innerHTML = '<li class="list-group-item text-muted">Nenhum produto adicionado.</li>';
        return;
    }

    currentBasketProducts.forEach((product, index) => {
        const itemHtml = `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <strong>${index + 1}. ${product.nome_produto}</strong>
                    <small class="text-muted d-block">Código: ${product.codigo_barras || 'N/A'}</small>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-secondary me-2 btn-edit-product" data-product-index="${index}">Editar</button>
                    <button class="btn btn-sm btn-outline-danger btn-remove-product" data-product-index="${index}">Excluir</button>
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
 * Adiciona um novo produto à cesta.
 */
async function handleAddProduct(event) {
    event.preventDefault();
    
    const productName = document.getElementById('productName').value.trim();
    const productBarcode = document.getElementById('productBarcode').value.trim();
    const btn = document.getElementById('btnAddProduct');
    
    if (!productName || !currentBasketId) return;

    btn.disabled = true;
    btn.textContent = 'Adicionando...';
    
    try {
        const newProduct = { nome_produto: productName, codigo_barras: productBarcode || null };
        
        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products`, {
            method: 'POST',
            body: JSON.stringify(newProduct)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao adicionar produto.');
        }
        
        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;
        
        // Atualizar lista local e limpar formulário
        renderProductsList();
        document.getElementById('addProductForm').reset();
        
        // Atualizar a contagem no card principal
        await loadBaskets(); 

    } catch (error) {
        console.error("Erro ao adicionar produto:", error);
        alert(`Erro: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Adicionar';
    }
}

/**
 * Remove um produto da cesta usando seu índice.
 */
async function handleRemoveProduct(event) {
    const index = event.target.dataset.productIndex;
    if (index === undefined || currentBasketId === null) return;
    
    if (!confirm(`Deseja remover o produto "${currentBasketProducts[index].nome_produto}"?`)) return;

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

    } catch (error) {
        console.error("Erro ao remover produto:", error);
        alert(`Erro: ${error.message}`);
    }
}

/**
 * Abre o modal de edição e carrega os dados do produto.
 */
function openEditProductModal(event) {
    const index = event.target.dataset.productIndex;
    const product = currentBasketProducts[index];

    if (!product) return;
    
    document.getElementById('editProductIndex').value = index;
    document.getElementById('editProductName').value = product.nome_produto;
    document.getElementById('editProductBarcode').value = product.codigo_barras || '';

    const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
    modal.show();
}

/**
 * Envia as alterações do produto para o backend.
 */
async function handleEditProductSubmit(event) {
    event.preventDefault();
    const index = document.getElementById('editProductIndex').value;
    const newName = document.getElementById('editProductName').value.trim();
    const newBarcode = document.getElementById('editProductBarcode').value.trim();

    if (!newName || currentBasketId === null) return;

    const btn = event.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
        const updateData = { 
            nome_produto: newName, 
            codigo_barras: newBarcode || null 
        };
        
        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/products/${index}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao editar produto.');
        }
        
        const updatedBasket = await response.json();
        currentBasketProducts = updatedBasket.produtos;
        
        // Fechar o modal e atualizar lista
        const modal = bootstrap.Modal.getInstance(document.getElementById('editProductModal'));
        if (modal) modal.hide();
        renderProductsList();

    } catch (error) {
        console.error("Erro ao editar produto:", error);
        alert(`Erro: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Alterações';
    }
}

/**
 * Remove todos os produtos da cesta.
 */
async function handleClearBasket() {
    if (currentBasketId === null) return;
    
    if (!confirm('Tem certeza que deseja REMOVER TODOS os produtos desta cesta?')) return;

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
        alert('Cesta limpa com sucesso!');
        await loadBaskets(); // Atualiza a contagem no card
    } catch (error) {
        console.error("Erro ao limpar cesta:", error);
        alert(`Erro: ${error.message}`);
    }
}

/**
 * Inicia a busca de preços em tempo real para os produtos da cesta.
 */
async function handleSearchPrices() {
    if (currentBasketId === null || currentBasketProducts.length === 0) {
        alert('Adicione produtos à cesta antes de buscar os preços.');
        return;
    }

    // Usaremos todos os mercados disponíveis
    const cnpjs = allSupermarkets.map(m => m.cnpj);
    if (cnpjs.length === 0) {
        alert('Nenhum mercado cadastrado para realizar a busca.');
        return;
    }

    // Fecha o modal de gerenciamento de produtos
    const manageModal = bootstrap.Modal.getInstance(document.getElementById('manageProductsModal'));
    if (manageModal) manageModal.hide();
    
    const btn = document.getElementById('btnSearchPrices');
    btn.disabled = true;
    btn.textContent = 'Buscando Preços...';
    document.getElementById('realtimeResults').innerHTML = '<p class="text-info">Buscando preços em tempo real, aguarde...</p>';
    document.getElementById('resultsTitle').style.display = 'block';

    try {
        // Envia a lista de CNPJs como query parameters
        const urlParams = cnpjs.map(c => 'cnpjs=' + c).join('&');
        
        const response = await authenticatedFetch(`/api/baskets/${currentBasketId}/realtime-prices?${urlParams}`, {
            method: 'POST' 
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao buscar preços.');
        }
        
        const data = await response.json();
        renderRealtimeResults(data.results);

    } catch (error) {
        console.error("Erro na busca em tempo real:", error);
        document.getElementById('realtimeResults').innerHTML = `<p class="text-danger">Erro ao buscar preços: ${error.message}</p>`;
    } finally {
        // O botão é reabilitado na próxima vez que o modal for aberto, pois ele é um elemento DOM estático.
        // No entanto, para fins de feedback visual se o modal não fechar por algum motivo:
        // btn.disabled = false;
        // btn.textContent = 'Buscar Preços em Mercados';
    }
}

/**
 * Renderiza os resultados da busca em tempo real em uma tabela.
 */
function renderRealtimeResults(results) {
    const resultsElement = document.getElementById('realtimeResults');
    
    if (results.length === 0) {
        resultsElement.innerHTML = '<p class="text-muted">Nenhum preço encontrado para os produtos da cesta nos mercados selecionados.</p>';
        return;
    }

    // Calcular o total de cada cesta
    const basketTotals = {};
    
    results.forEach(item => {
        const marketName = item.nome_supermercado;
        const price = item.preco_produto || 0;
        
        if (!basketTotals[marketName]) {
            basketTotals[marketName] = 0;
        }
        
        // Simplesmente soma os produtos encontrados. 
        // Para uma cesta ideal, precisaríamos de lógica de agrupamento (e.g., o mais barato de cada produto).
        // Aqui, somamos todos os resultados encontrados para dar uma estimativa.
        basketTotals[marketName] += price; 
    });

    // 1. Tabela de Totais (Resumo)
    let summaryHtml = `
        <h3 class="mt-4">Resumo da Cesta</h3>
        <table class="table table-bordered table-sm">
            <thead>
                <tr>
                    <th>Mercado</th>
                    <th>Total Estimado (R$)</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    const sortedTotals = Object.entries(basketTotals).sort(([, a], [, b]) => a - b);
    
    sortedTotals.forEach(([market, total]) => {
        summaryHtml += `
            <tr class="${total === sortedTotals[0][1] ? 'table-success fw-bold' : ''}">
                <td>${market}</td>
                <td>R$ ${total.toFixed(2)}</td>
            </tr>
        `;
    });
    
    summaryHtml += `</tbody></table>`;
    
    // 2. Tabela de Detalhes
    let detailHtml = `
        <h3 class="mt-5">Detalhes dos Produtos Encontrados</h3>
        <table class="table table-striped table-hover">
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
        return a.preco_produto - b.preco_produto;
    });

    results.forEach(item => {
        detailHtml += `
            <tr>
                <td>${item.nome_produto}</td>
                <td>${item.nome_supermercado || 'N/A'}</td>
                <td>${(item.preco_produto || 0).toFixed(2)}</td>
                <td>${item.unidade || 'N/A'}</td>
            </tr>
        `;
    });

    detailHtml += `</tbody></table>`;
    
    resultsElement.innerHTML = summaryHtml + detailHtml;
}
