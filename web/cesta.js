// cesta.js - VERSÃO COMPLETA CORRIGIDA
let userBasket = { 
    id: null, 
    basket_name: "Minha Cesta", 
    products: [] 
};
let allMarkets = [];
let selectedMarkets = new Set();
let currentUser = null;
let isAdmin = false;

// Função para fetch autenticado
async function authenticatedFetch(url, options = {}) {
    try {
        const session = await getSession();
        if (!session) {
            // Se não houver sessão, redireciona para o login ou mostra a seção de login
            showAuthRequired();
            throw new Error('Usuário não autenticado');
        }

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(url, { ...options, ...defaultOptions });
        
        if (response.status === 401) {
            // Tenta renovar o token e refazer a chamada
            await handleTokenRefresh();
            return authenticatedFetch(url, options); // Tenta novamente com o novo token
        }
        
        return response;
    } catch (error) {
        console.error('Erro no fetch autenticado:', error);
        // Não mostra mensagem de erro aqui para não poluir a UI,
        // a função que chamou deve tratar o erro.
        throw error;
    }
}

// Carrega a cesta do usuário
async function loadUserBasket() {
    try {
        console.log('🔍 Carregando cesta do usuário...');
        const response = await authenticatedFetch('/api/basket');
        
        if (response.ok) {
            const basketData = await response.json();
            userBasket = basketData;
            console.log('✅ Cesta carregada:', userBasket);
            renderProducts();
        } else {
            // Se a resposta não for OK, o erro será capturado pelo bloco catch
            const errorText = await response.text();
            throw new Error(`Erro ao carregar cesta: ${response.status} ${errorText}`);
        }
    } catch (error) {
        console.error('💥 Erro fatal ao carregar cesta:', error);
        showMessage('Não foi possível carregar sua cesta. Tente recarregar a página.', 'error');
        showAuthRequired(); // Mostra a tela de login como fallback
    }
}

// Carrega todas as cestas (apenas admin)
async function loadAllBaskets() {
    try {
        const response = await authenticatedFetch('/api/basket/all');
        if (response.ok) {
            const allBaskets = await response.json();
            renderAllBaskets(allBaskets);
        } else {
            console.error('Erro ao carregar todas as cestas');
        }
    } catch (error) {
        console.error('Erro ao carregar todas as cestas:', error);
    }
}

// Renderiza todas as cestas (admin)
function renderAllBaskets(baskets) {
    const container = document.getElementById('admin-baskets-container');
    if (!container) return;

    if (baskets.length === 0) {
        container.innerHTML = '<p>Nenhuma cesta de usuário encontrada.</p>';
        return;
    }

    container.innerHTML = `
        <div class="baskets-grid">
            ${baskets.map(basket => `
                <div class="basket-card">
                    <div class="basket-header">
                        <h4>${basket.basket_name || 'Cesta sem nome'}</h4>
                        <span class="user-badge">${basket.user_name || 'Usuário'}</span>
                    </div>
                    <div class="basket-info">
                        <p><strong>Email:</strong> ${basket.user_email || 'N/A'}</p>
                        <p><strong>Produtos:</strong> ${basket.products.length}</p>
                        <p><strong>Atualizada em:</strong> ${new Date(basket.updated_at).toLocaleString('pt-BR')}</p>
                    </div>
                    <div class="basket-products">
                        ${basket.products.slice(0, 5).map(product => `
                            <div class="product-preview">
                                <span class="product-name">${product.product_name || product.product_barcode}</span>
                            </div>
                        `).join('')}
                        ${basket.products.length > 5 ? `<p style="font-size: 12px; color: var(--text-muted); margin-top: 5px;">... e mais ${basket.products.length - 5} produtos.</p>` : ''}
                        ${basket.products.length === 0 ? '<p style="font-size: 12px; color: var(--text-muted);">Cesta vazia</p>' : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}


// Busca o nome do produto pelo código de barras
async function getProductName(barcode) {
    try {
        console.log(`🔍 Buscando nome para o produto: ${barcode}`);
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(barcode)}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const exactMatch = data.results.find(p => p.codigo_barras === barcode);
                return exactMatch ? exactMatch.nome_produto : data.results[0].nome_produto;
            }
        }
        console.log(`ℹ️ Nome não encontrado para ${barcode}, usando nome genérico.`);
        return null; // Retorna null se não encontrar
    } catch (error) {
        console.error(`💥 Erro na busca do nome do produto ${barcode}:`, error);
        return null; // Retorna null em caso de erro
    }
}

// Adiciona produto à cesta
async function addProduct() {
    const barcodeInput = document.getElementById('product-barcode');
    const addButton = barcodeInput.nextElementSibling;
    const barcode = barcodeInput.value.trim();
    
    if (!barcode || !/^\d{8,}$/.test(barcode)) {
        showMessage('Código de barras inválido. Use apenas números (mínimo 8 dígitos).', 'warning');
        return;
    }
    
    if (userBasket.products.length >= 25) {
        showMessage('Limite de 25 produtos atingido.', 'warning');
        return;
    }
    
    if (userBasket.products.some(p => p.product_barcode === barcode)) {
        showMessage('Este produto já está na cesta.', 'info');
        return;
    }
    
    // UI de carregamento
    barcodeInput.disabled = true;
    addButton.disabled = true;
    addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...';
    
    try {
        const productName = await getProductName(barcode);
        
        // Adiciona o produto à cesta local
        userBasket.products.push({
            product_barcode: barcode,
            product_name: productName || `Produto ${barcode}` // Usa nome genérico se não encontrar
        });
        
        // Salva a cesta inteira no servidor
        await saveBasket();
        
        renderProducts();
        showMessage('✅ Produto adicionado com sucesso!', 'success');
        barcodeInput.value = '';
        
    } catch (error) {
        console.error('Erro ao adicionar produto:', error);
        // Reverte a adição local em caso de falha ao salvar
        userBasket.products = userBasket.products.filter(p => p.product_barcode !== barcode);
        showMessage('Erro ao salvar o produto na cesta. Tente novamente.', 'error');
    } finally {
        // Restaura a UI
        barcodeInput.disabled = false;
        addButton.disabled = false;
        addButton.innerHTML = '<i class="fas fa-plus"></i> Adicionar Produto';
        barcodeInput.focus();
    }
}

// Remove produto específico
async function removeProduct(barcode) {
    showConfirmationModal('Tem certeza que deseja remover este produto?', async () => {
        const originalProducts = [...userBasket.products];
        userBasket.products = userBasket.products.filter(p => p.product_barcode !== barcode);
        renderProducts(); // Atualiza a UI imediatamente

        try {
            await saveBasket();
            showMessage('✅ Produto removido com sucesso!', 'success');
        } catch (error) {
            userBasket.products = originalProducts; // Restaura em caso de erro
            renderProducts();
            showMessage('Erro ao remover o produto. Tente novamente.', 'error');
        }
    });
}

// Limpa toda a cesta
async function clearBasket() {
    if (userBasket.products.length === 0) {
        showMessage('A cesta já está vazia.', 'info');
        return;
    }
    
    showConfirmationModal('Tem certeza que deseja limpar toda a cesta? Esta ação não pode ser desfeita.', async () => {
        const originalProducts = [...userBasket.products];
        userBasket.products = [];
        renderProducts(); // Atualiza a UI imediatamente

        try {
            await saveBasket();
            showMessage('✅ Cesta limpa com sucesso!', 'success');
        } catch (error) {
            userBasket.products = originalProducts; // Restaura em caso de erro
            renderProducts();
            showMessage('Erro ao limpar a cesta. Tente novamente.', 'error');
        }
    });
}

// Abre modal para editar produto
function openEditModal(barcode) {
    const product = userBasket.products.find(p => p.product_barcode === barcode);
    if (!product) return;

    const modal = document.getElementById('edit-product-modal');
    document.getElementById('edit-barcode').value = product.product_barcode;
    document.getElementById('edit-name').value = product.product_name || '';
    
    modal.setAttribute('data-original-barcode', product.product_barcode);
    modal.style.display = 'flex';
}

// Fecha modal de edição
function closeEditModal() {
    document.getElementById('edit-product-modal').style.display = 'none';
}

// Salva edição do produto
async function saveProductEdit() {
    const modal = document.getElementById('edit-product-modal');
    const originalBarcode = modal.getAttribute('data-original-barcode');
    const newBarcode = document.getElementById('edit-barcode').value.trim();
    const newName = document.getElementById('edit-name').value.trim();
    
    if (!newBarcode || !/^\d{8,}$/.test(newBarcode)) {
        showMessage('Código de barras inválido.', 'warning');
        return;
    }

    const originalProducts = [...userBasket.products];
    const productIndex = userBasket.products.findIndex(p => p.product_barcode === originalBarcode);

    if (productIndex === -1) return;

    userBasket.products[productIndex] = { product_barcode: newBarcode, product_name: newName };
    renderProducts();
    closeEditModal();

    try {
        await saveBasket();
        showMessage('✅ Produto atualizado com sucesso!', 'success');
    } catch (error) {
        userBasket.products = originalProducts; // Restaura em caso de erro
        renderProducts();
        showMessage('Erro ao salvar a alteração. Tente novamente.', 'error');
    }
}

// Salva a cesta no servidor - CORRIGIDO (usando PATCH)
async function saveBasket() {
    try {
        console.log('💾 Salvando cesta no servidor:', userBasket);
        
        const response = await authenticatedFetch('/api/basket', {
            method: 'PATCH',
            body: JSON.stringify({
                products: userBasket.products
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Erro ${response.status}: ${errorData.detail || 'Falha ao salvar'}`);
        }
        
        const savedBasket = await response.json();
        userBasket = savedBasket; // Atualiza a cesta local com a resposta do servidor
        console.log('✅ Cesta salva com sucesso:', userBasket);
        
    } catch (error) {
        console.error('💥 Erro CRÍTICO ao salvar cesta:', error);
        throw error; // Propaga o erro para a função que chamou
    }
}

// Exporta a cesta para JSON
function exportBasket() {
    if (userBasket.products.length === 0) {
        showMessage('A cesta está vazia, não há nada para exportar.', 'info');
        return;
    }
    
    const dataStr = JSON.stringify({
        basket_name: userBasket.basket_name,
        products: userBasket.products,
        export_date: new Date().toISOString()
    }, null, 2);
    
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cesta-basica-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showMessage('✅ Cesta exportada com sucesso!', 'success');
}

// Renderiza os produtos na grade
function renderProducts() {
    const grid = document.getElementById('products-grid');
    const countElement = document.getElementById('product-count');
    const emptyState = document.getElementById('empty-state');
    
    if (!grid || !countElement || !emptyState) return;
    
    countElement.textContent = userBasket.products.length;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
    } else {
        emptyState.style.display = 'none';
        grid.innerHTML = userBasket.products.map(product => `
            <div class="product-card">
                <div class="product-content">
                    <div class="product-actions">
                        <button class="btn-icon edit-btn" onclick="openEditModal('${product.product_barcode}')" title="Editar produto">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon remove-btn" onclick="removeProduct('${product.product_barcode}')" title="Remover produto">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="product-info">
                        <div class="product-name">${product.product_name || 'Produto não identificado'}</div>
                        <div class="product-barcode">Código: ${product.product_barcode}</div>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// Carrega mercados
async function loadMarkets() {
    try {
        const response = await fetch('/api/supermarkets/public');
        if (response.ok) {
            allMarkets = await response.json();
            renderMarketSelection();
        } else {
            document.getElementById('market-selection').innerHTML = '<p class="error">Erro ao carregar mercados.</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        document.getElementById('market-selection').innerHTML = '<p class="error">Erro de conexão ao buscar mercados.</p>';
    }
}

// Renderiza seleção de mercados
function renderMarketSelection(filteredMarkets = allMarkets) {
    const container = document.getElementById('market-selection');
    if (!container) return;
    
    if (filteredMarkets.length === 0) {
        container.innerHTML = '<p>Nenhum mercado encontrado.</p>';
        return;
    }
    
    container.innerHTML = filteredMarkets.map(market => `
        <div class="market-card ${selectedMarkets.has(market.cnpj) ? 'selected' : ''}" data-cnpj="${market.cnpj}">
            <div class="market-info">
                <div class="market-name">${market.nome}</div>
                <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
            </div>
        </div>
    `).join('');

    // Adiciona os event listeners após renderizar
    container.querySelectorAll('.market-card').forEach(card => {
        card.addEventListener('click', () => {
            const cnpj = card.dataset.cnpj;
            toggleMarket(cnpj);
            card.classList.toggle('selected');
            updateSelectedMarketsCount();
        });
    });
}

// Funções auxiliares de mercado
function toggleMarket(cnpj) {
    selectedMarkets.has(cnpj) ? selectedMarkets.delete(cnpj) : selectedMarkets.add(cnpj);
}

function selectAllMarkets() {
    allMarkets.forEach(market => selectedMarkets.add(market.cnpj));
    document.querySelectorAll('.market-card').forEach(card => card.classList.add('selected'));
    updateSelectedMarketsCount();
}

function deselectAllMarkets() {
    selectedMarkets.clear();
    document.querySelectorAll('.market-card').forEach(card => card.classList.remove('selected'));
    updateSelectedMarketsCount();
}

function updateSelectedMarketsCount() {
    const countElement = document.getElementById('selectedMarketsCount');
    if (countElement) countElement.textContent = selectedMarkets.size;
}

function filterMarkets(searchTerm) {
    const term = searchTerm.toLowerCase();
    const filtered = allMarkets.filter(market => 
        market.nome.toLowerCase().includes(term) || 
        (market.endereco && market.endereco.toLowerCase().includes(term))
    );
    renderMarketSelection(filtered);
}

// Calcula preços da cesta
async function calculateBasket() {
    if (userBasket.products.length === 0) {
        showMessage('Adicione produtos à cesta antes de calcular.', 'warning');
        return;
    }
    
    if (selectedMarkets.size === 0) {
        showMessage('Selecione pelo menos um mercado para comparar.', 'warning');
        return;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
    resultsSection.style.display = 'block';
    document.getElementById('complete-basket-details').innerHTML = '<div class="loading">Calculando...</div>';
    document.getElementById('mixed-basket-details').innerHTML = '<div class="loading">Calculando...</div>';
    
    try {
        const response = await authenticatedFetch('/api/basket/calculate', {
            method: 'POST',
            body: JSON.stringify({
                basket_id: userBasket.id,
                cnpjs: Array.from(selectedMarkets)
            })
        });
        
        if (response.ok) {
            const results = await response.json();
            displayResults(results);
        } else {
            const errorData = await response.json();
            showMessage(`Erro ao calcular: ${errorData.detail}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao calcular preços:', error);
        showMessage('Erro de conexão ao calcular preços. Tente novamente.', 'error');
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-calculator"></i> Calcular Melhores Preços';
    }
}

// Exibe os resultados do cálculo
function displayResults(results) {
    displayCompleteBasket(results.best_complete_basket);
    displayMixedBasket(results.mixed_basket_results);
}

function displayCompleteBasket(bestBasket) {
    const container = document.getElementById('complete-basket-details');
    if (!bestBasket) {
        container.innerHTML = `<div class="empty-state"><p>Nenhum mercado encontrou todos os produtos.</p></div>`;
        return;
    }
    
    container.innerHTML = `
        <div class="price-highlight">R$ ${bestBasket.total.toFixed(2)}</div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>🏪 ${bestBasket.market_name}</strong></p>
            <p>📊 ${bestBasket.products_found}/${bestBasket.total_products} produtos encontrados</p>
        </div>
        <div class="product-list">
            ${bestBasket.products.map(p => `
                <div class="product-item ${p.found ? '' : 'not-found'}">
                    <div class="product-info"><div class="product-name">${p.name}</div></div>
                    <div class="product-price">${p.found ? `R$ ${p.price.toFixed(2)}` : 'Não encontrado'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayMixedBasket(mixedBasket) {
    const container = document.getElementById('mixed-basket-details');
    const breakdownContainer = document.getElementById('mixed-breakdown');
    const marketBreakdownEl = document.getElementById('market-breakdown');

    const foundProducts = mixedBasket.products.filter(p => p.found).length;
    
    container.innerHTML = `
        <div class="price-highlight">
            R$ ${mixedBasket.total.toFixed(2)}
            ${mixedBasket.economy_percent > 0 ? `<span class="economy-badge">-${mixedBasket.economy_percent.toFixed(1)}%</span>` : ''}
        </div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>📊 ${foundProducts}/${mixedBasket.products.length} produtos encontrados</strong></p>
        </div>
        <div class="product-list">
            ${mixedBasket.products.map(p => `
                <div class="product-item ${p.found ? '' : 'not-found'}">
                    <div class="product-info">
                        <div class="product-name">${p.name}</div>
                        ${p.found ? `<small>🏪 ${p.market_name}</small>` : ''}
                    </div>
                    <div class="product-price">${p.found ? `R$ ${p.price.toFixed(2)}` : 'Não encontrado'}</div>
                </div>
            `).join('')}
        </div>
    `;

    if (mixedBasket.economy_percent > 0 && Object.keys(mixedBasket.market_breakdown).length > 1) {
        breakdownContainer.style.display = 'block';
        marketBreakdownEl.innerHTML = Object.values(mixedBasket.market_breakdown).map(market => `
            <div class="market-store" style="margin-bottom: 15px;">
                <h4>🏪 ${market.market_name} - Total: R$ ${market.subtotal.toFixed(2)}</h4>
                <div class="product-list">
                    ${market.products.map(p => `
                        <div class="product-item">
                            <div class="product-info"><div class="product-name">${p.name}</div></div>
                            <div class="product-price">R$ ${p.price.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } else {
        breakdownContainer.style.display = 'none';
    }
}

// Funções de UI (Modais e Mensagens)
function showMessage(message, type = 'info') {
    const container = document.body;
    const messageDiv = document.createElement('div');
    messageDiv.className = `flash-message flash-${type}`;
    messageDiv.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()">×</button>`;
    container.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 5000);
}

function showConfirmationModal(message, onConfirm) {
    const modal = document.getElementById('confirmation-modal');
    document.getElementById('confirmation-message').textContent = message;
    const confirmBtn = document.getElementById('confirm-action-btn');
    
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeConfirmationModal();
    });
    
    modal.style.display = 'flex';
}

function closeConfirmationModal() {
    document.getElementById('confirmation-modal').style.display = 'none';
}

function showAuthRequired() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('basket-interface').style.display = 'none';
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando página da cesta...');
    
    // Configura eventos de UI
    const barcodeInput = document.getElementById('product-barcode');
    barcodeInput.addEventListener('keypress', e => e.key === 'Enter' && addProduct());
    
    const marketSearch = document.getElementById('marketSearch');
    marketSearch.addEventListener('input', () => filterMarkets(marketSearch.value));
    document.getElementById('clearMarketSearch').addEventListener('click', () => {
        marketSearch.value = '';
        filterMarkets('');
    });
    
    try {
        currentUser = await getAuthUser();
        if (currentUser) {
            console.log('✅ Usuário autenticado:', currentUser.email);
            isAdmin = currentUser.role === 'admin';
            
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('basket-interface').style.display = 'block';
            
            await Promise.all([loadUserBasket(), loadMarkets()]);
            
            if (isAdmin) {
                const adminSection = document.getElementById('admin-section');
                adminSection.style.display = 'block';
                await loadAllBaskets();
            }
        } else {
            console.log('❌ Usuário não autenticado. Exibindo tela de login.');
            showAuthRequired();
        }
    } catch (error) {
        console.error('💥 Erro na inicialização:', error);
        showMessage('Erro ao carregar a página. Por favor, recarregue.', 'error');
        showAuthRequired();
    }
});
