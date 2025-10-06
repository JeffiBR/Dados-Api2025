// cesta.js - VERSÃO COMPLETA ATUALIZADA
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
            throw new Error('Usuário não autenticado');
        }

        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (response.status === 401) {
            await handleTokenRefresh();
            return authenticatedFetch(url, options);
        }
        
        return response;
    } catch (error) {
        console.error('Erro no fetch autenticado:', error);
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
        } else if (response.status === 404) {
            await saveBasket();
        } else {
            console.error('❌ Erro ao carregar cesta:', response.status);
            const errorText = await response.text();
            console.error('Detalhes do erro:', errorText);
        }
    } catch (error) {
        console.error('💥 Erro ao carregar cesta:', error);
        showMessage('Erro ao carregar sua cesta. Tente recarregar a página.', 'error');
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
    const adminSection = document.getElementById('admin-section');
    if (!adminSection) return;

    if (baskets.length === 0) {
        adminSection.innerHTML = '<p>Nenhuma cesta encontrada.</p>';
        return;
    }

    adminSection.innerHTML = `
        <div class="admin-baskets">
            <h3><i class="fas fa-users"></i> Todas as Cestas dos Usuários</h3>
            <div class="baskets-grid">
                ${baskets.map(basket => `
                    <div class="basket-card">
                        <div class="basket-header">
                            <h4>${basket.basket_name}</h4>
                            <span class="user-badge">${basket.user_id}</span>
                        </div>
                        <div class="basket-info">
                            <p><strong>Produtos:</strong> ${basket.products.length}</p>
                            <p><strong>Atualizada:</strong> ${new Date(basket.updated_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <div class="basket-products">
                            ${basket.products.slice(0, 3).map(product => `
                                <div class="product-preview">
                                    <span class="product-name">${product.product_name || product.product_barcode}</span>
                                    <span class="product-barcode">${product.product_barcode}</span>
                                </div>
                            `).join('')}
                            ${basket.products.length > 3 ? `<p>... e mais ${basket.products.length - 3} produtos</p>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Busca o nome do produto pelo código de barras
async function getProductName(barcode) {
    try {
        console.log(`🔍 Buscando produto: ${barcode}`);
        
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(barcode)}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📦 Resultados da busca:', data);
            
            if (data.results && data.results.length > 0) {
                const exactMatch = data.results.find(p => p.codigo_barras === barcode);
                if (exactMatch) {
                    return exactMatch.nome_produto;
                }
                return data.results[0].nome_produto;
            }
        } else {
            console.warn('⚠️ Produto não encontrado na busca');
        }
        return null;
    } catch (error) {
        console.error('💥 Erro na busca do produto:', error);
        return null;
    }
}

// Adiciona produto à cesta
async function addProduct() {
    const barcodeInput = document.getElementById('product-barcode');
    const barcode = barcodeInput.value.trim();
    
    if (!barcode) {
        showMessage('Por favor, digite um código de barras', 'warning');
        return;
    }
    
    if (!/^\d+$/.test(barcode)) {
        showMessage('Código de barras deve conter apenas números', 'warning');
        return;
    }
    
    if (barcode.length < 8) {
        showMessage('Código de barras muito curto (mínimo 8 dígitos)', 'warning');
        return;
    }
    
    if (userBasket.products.length >= 25) {
        showMessage('Limite de 25 produtos atingido', 'warning');
        return;
    }
    
    if (userBasket.products.some(p => p.product_barcode === barcode)) {
        showMessage('Este produto já está na cesta', 'warning');
        return;
    }
    
    // Mostra loading
    const originalText = barcodeInput.value;
    barcodeInput.value = '🔄 Buscando produto...';
    barcodeInput.disabled = true;
    
    try {
        const productName = await getProductName(barcode);
        
        userBasket.products.push({
            product_barcode: barcode,
            product_name: productName || `Produto ${barcode}`
        });
        
        await saveBasket();
        renderProducts();
        
        showMessage('✅ Produto adicionado com sucesso!', 'success');
        barcodeInput.value = '';
        
    } catch (error) {
        console.error('Erro ao adicionar produto:', error);
        showMessage('Erro ao adicionar produto. Tente novamente.', 'error');
        barcodeInput.value = originalText;
    } finally {
        barcodeInput.disabled = false;
        barcodeInput.focus();
    }
}

// Remove produto específico
async function removeProduct(barcode) {
    if (confirm('Tem certeza que deseja remover este produto da cesta?')) {
        try {
            const response = await authenticatedFetch(`/api/basket/product/${barcode}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                // Atualiza a cesta local
                userBasket.products = userBasket.products.filter(p => p.product_barcode !== barcode);
                renderProducts();
                showMessage('✅ Produto removido com sucesso!', 'success');
            } else {
                throw new Error('Erro ao remover produto');
            }
        } catch (error) {
            console.error('Erro ao remover produto:', error);
            showMessage('Erro ao remover produto', 'error');
        }
    }
}

// Limpa toda a cesta
async function clearBasket() {
    if (userBasket.products.length === 0) {
        showMessage('A cesta já está vazia', 'info');
        return;
    }
    
    if (confirm('Tem certeza que deseja limpar toda a cesta? Esta ação não pode ser desfeita.')) {
        try {
            const response = await authenticatedFetch('/api/basket/clear', {
                method: 'DELETE'
            });
            
            if (response.ok) {
                userBasket.products = [];
                renderProducts();
                showMessage('✅ Cesta limpa com sucesso!', 'success');
            } else {
                throw new Error('Erro ao limpar cesta');
            }
        } catch (error) {
            console.error('Erro ao limpar cesta:', error);
            showMessage('Erro ao limpar cesta', 'error');
        }
    }
}

// Edita produto existente
async function editProduct(oldBarcode, newBarcode, newName = null) {
    try {
        // Remove o produto antigo
        userBasket.products = userBasket.products.filter(p => p.product_barcode !== oldBarcode);
        
        // Busca novo nome se necessário
        let productName = newName;
        if (!productName) {
            productName = await getProductName(newBarcode);
        }
        
        // Adiciona o produto atualizado
        userBasket.products.push({
            product_barcode: newBarcode,
            product_name: productName || `Produto ${newBarcode}`
        });
        
        await saveBasket();
        renderProducts();
        showMessage('✅ Produto atualizado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao editar produto:', error);
        showMessage('Erro ao editar produto', 'error');
    }
}

// Salva a cesta no servidor
async function saveBasket() {
    try {
        console.log('💾 Salvando cesta:', userBasket);
        
        const response = await authenticatedFetch('/api/basket', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                products: userBasket.products
            })
        });
        
        if (response.ok) {
            const savedBasket = await response.json();
            userBasket = savedBasket;
            console.log('✅ Cesta salva com sucesso:', userBasket);
            return true;
        } else {
            const errorText = await response.text();
            console.error('❌ Erro ao salvar cesta:', response.status, errorText);
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('💥 Erro ao salvar cesta:', error);
        throw error;
    }
}

// Mostra modal de edição
function showEditModal(product) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Editar Produto</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Código de Barras:</label>
                    <input type="text" id="edit-barcode" value="${product.product_barcode}" maxlength="20">
                </div>
                <div class="form-group">
                    <label>Nome do Produto:</label>
                    <input type="text" id="edit-name" value="${product.product_name || ''}" placeholder="Nome do produto">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="saveProductEdit('${product.product_barcode}')">Salvar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Salva edição do produto
function saveProductEdit(oldBarcode) {
    const newBarcode = document.getElementById('edit-barcode').value.trim();
    const newName = document.getElementById('edit-name').value.trim();
    
    if (!newBarcode) {
        showMessage('Código de barras não pode estar vazio', 'warning');
        return;
    }
    
    if (!/^\d+$/.test(newBarcode)) {
        showMessage('Código de barras deve conter apenas números', 'warning');
        return;
    }
    
    editProduct(oldBarcode, newBarcode, newName || null);
    document.querySelector('.modal-overlay').remove();
}

// Renderiza os produtos
function renderProducts() {
    const grid = document.getElementById('products-grid');
    const countElement = document.getElementById('product-count');
    const emptyState = document.getElementById('empty-state');
    
    if (!grid) return;
    
    countElement.textContent = userBasket.products.length;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" id="empty-state">
                <div class="icon"><i class="fas fa-shopping-basket"></i></div>
                <h3>Sua cesta está vazia</h3>
                <p>Adicione produtos usando o código de barras acima</p>
            </div>
        `;
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    grid.innerHTML = '';
    
    userBasket.products.forEach((product, index) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-content">
                <div class="product-actions">
                    <button class="btn-icon edit-btn" onclick="showEditModal(${JSON.stringify(product).replace(/"/g, '&quot;')})" title="Editar produto">
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
        `;
        grid.appendChild(productCard);
    });
}

// Carrega mercados
async function loadMarkets() {
    try {
        const response = await fetch('/api/supermarkets/public');
        if (response.ok) {
            allMarkets = await response.json();
            renderMarketSelection();
        } else {
            document.getElementById('market-selection').innerHTML = 
                '<p class="not-found">Erro ao carregar mercados</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        document.getElementById('market-selection').innerHTML = 
            '<p class="not-found">Erro ao carregar mercados</p>';
    }
}

// Renderiza seleção de mercados
function renderMarketSelection() {
    const container = document.getElementById('market-selection');
    if (!container) return;
    
    if (!allMarkets || allMarkets.length === 0) {
        container.innerHTML = '<p class="not-found">Nenhum mercado disponível</p>';
        return;
    }
    
    container.innerHTML = '';
    
    allMarkets.forEach(market => {
        const marketCard = document.createElement('div');
        marketCard.className = 'market-card';
        if (selectedMarkets.has(market.cnpj)) {
            marketCard.classList.add('selected');
        }
        marketCard.innerHTML = `
            <div class="market-info">
                <div class="market-name">${market.nome}</div>
                <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
            </div>
        `;
        
        marketCard.addEventListener('click', () => {
            toggleMarket(market.cnpj);
            marketCard.classList.toggle('selected');
            updateSelectedMarketsCount();
        });
        
        container.appendChild(marketCard);
    });
    
    updateSelectedMarketsCount();
}

// Funções auxiliares de mercado
function toggleMarket(cnpj) {
    if (selectedMarkets.has(cnpj)) {
        selectedMarkets.delete(cnpj);
    } else {
        selectedMarkets.add(cnpj);
    }
}

function selectAllMarkets() {
    allMarkets.forEach(market => selectedMarkets.add(market.cnpj));
    renderMarketSelection();
}

function deselectAllMarkets() {
    selectedMarkets.clear();
    renderMarketSelection();
}

function updateSelectedMarketsCount() {
    const countElement = document.getElementById('selectedMarketsCount');
    if (countElement) {
        countElement.textContent = selectedMarkets.size;
    }
}

function filterMarkets(searchTerm) {
    const marketCards = document.querySelectorAll('.market-card');
    const term = searchTerm.toLowerCase();
    
    marketCards.forEach(card => {
        const marketName = card.querySelector('.market-name').textContent.toLowerCase();
        const marketAddress = card.querySelector('.market-address').textContent.toLowerCase();
        if (marketName.includes(term) || marketAddress.includes(term)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

// Calcula preços da cesta
async function calculateBasket() {
    if (userBasket.products.length === 0) {
        alert('Adicione produtos à cesta antes de calcular');
        return;
    }
    
    if (selectedMarkets.size === 0) {
        alert('Selecione pelo menos um mercado');
        return;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
    if (resultsSection) resultsSection.style.display = 'block';
    
    try {
        const response = await authenticatedFetch('/api/basket/calculate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                basket_id: userBasket.id,
                cnpjs: Array.from(selectedMarkets)
            })
        });
        
        if (response.ok) {
            const results = await response.json();
            displayResults(results);
        } else {
            const errorText = await response.text();
            console.error('Erro ao calcular preços:', errorText);
            alert('Erro ao calcular preços. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-calculator"></i> Calcular Melhores Preços';
    }
}

// Função para mostrar mensagens
function showMessage(message, type = 'info') {
    const existingMessage = document.querySelector('.flash-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `flash-message flash-${type}`;
    messageDiv.innerHTML = `
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">×</button>
    `;
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        if (messageDiv.parentElement) {
            messageDiv.remove();
        }
    }, 5000);
}

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Inicializando página da cesta...');
    
    // Configura eventos
    const barcodeInput = document.getElementById('product-barcode');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addProduct();
            }
        });
    }
    
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    
    if (marketSearch) {
        marketSearch.addEventListener('input', function() {
            filterMarkets(this.value);
        });
    }
    
    if (clearMarketSearch) {
        clearMarketSearch.addEventListener('click', function() {
            marketSearch.value = '';
            filterMarkets('');
        });
    }
    
    try {
        currentUser = await getAuthUser();
        
        if (currentUser) {
            console.log('✅ Usuário autenticado:', currentUser.email);
            isAdmin = currentUser.role === 'admin';
            
            await Promise.all([
                loadUserBasket(),
                loadMarkets()
            ]);
            
            // Se for admin, carrega todas as cestas
            if (isAdmin) {
                await loadAllBaskets();
            }
            
        } else {
            console.log('❌ Usuário não autenticado');
            showAuthRequired();
        }
    } catch (error) {
        console.error('💥 Erro na inicialização:', error);
        showMessage('Erro ao carregar a página. Tente recarregar.', 'error');
    }
});

// Função para mostrar seção de login necessária
function showAuthRequired() {
    const grid = document.getElementById('products-grid');
    const marketSection = document.getElementById('market-selection');
    
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <div class="icon">🔒</div>
                <h3>Login Necessário</h3>
                <p>Faça login para gerenciar sua cesta básica</p>
                <button onclick="window.location.href='/login.html'" class="btn btn-primary" style="margin-top: 15px;">
                    Fazer Login
                </button>
            </div>
        `;
    }
    
    if (marketSection) {
        marketSection.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <p>Faça login para selecionar mercados</p>
            </div>
        `;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    if (calculateBtn) calculateBtn.disabled = true;
}
