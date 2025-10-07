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
            // Cria uma cesta vazia se não existir
            await createUserBasket();
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

// Cria uma nova cesta para o usuário
async function createUserBasket() {
    try {
        const response = await authenticatedFetch('/api/basket', {
            method: 'POST'
        });
        
        if (response.ok) {
            const basketData = await response.json();
            userBasket = basketData;
            console.log('✅ Cesta criada:', userBasket);
            renderProducts();
        } else {
            throw new Error('Erro ao criar cesta');
        }
    } catch (error) {
        console.error('Erro ao criar cesta:', error);
        throw error;
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
                            <div class="user-info">
                                <span class="user-badge">${basket.user_name || 'Usuário'}</span>
                                <span class="user-email">${basket.user_email}</span>
                            </div>
                        </div>
                        <div class="basket-info">
                            <p><strong>Produtos:</strong> ${basket.products.length}</p>
                            <p><strong>Criada:</strong> ${new Date(basket.created_at).toLocaleString('pt-BR')}</p>
                            <p><strong>Atualizada:</strong> ${new Date(basket.updated_at).toLocaleString('pt-BR')}</p>
                        </div>
                        <div class="basket-products">
                            <h5>Produtos na Cesta:</h5>
                            ${basket.products.slice(0, 5).map(product => `
                                <div class="product-preview">
                                    <span class="product-name">${product.product_name || product.product_barcode}</span>
                                    <span class="product-barcode">${product.product_barcode}</span>
                                </div>
                            `).join('')}
                            ${basket.products.length > 5 ? `<p class="more-products">... e mais ${basket.products.length - 5} produtos</p>` : ''}
                            ${basket.products.length === 0 ? '<p class="empty-basket">Cesta vazia</p>' : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Busca o nome do produto pelo código de barras - USANDO /api/realtime-search
async function getProductName(barcode) {
    try {
        console.log(`🔍 Buscando produto no endpoint realtime-search: ${barcode}`);

        const response = await authenticatedFetch('/api/realtime-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                produto: barcode,
                cnpjs: [] // busca global, sem filtrar por mercado
            })
        });

        if (!response.ok) {
            console.warn('⚠️ Erro na busca:', response.status);
            return null;
        }

        const data = await response.json();
        console.log('📦 Resultados da busca:', data);

        // Verifica se retornou resultados válidos
        if (Array.isArray(data) && data.length > 0) {
            // Busca produto com código exato
            const exactMatch = data.find(p => p.codigo_barras === barcode);
            if (exactMatch) return exactMatch.nome_produto;

            // Ou retorna o primeiro nome da lista
            return data[0].nome_produto || null;
        }

        return null;
    } catch (error) {
        console.error('💥 Erro ao buscar produto:', error);
        return null;
    }
}

// Adiciona produto à cesta - CORRIGIDO
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
        
        if (!productName) {
            // Produto não encontrado, pergunta se deseja adicionar mesmo assim
            if (confirm(`Produto com código ${barcode} não encontrado na base de dados. Deseja adicionar mesmo assim?`)) {
                userBasket.products.push({
                    product_barcode: barcode,
                    product_name: `Produto ${barcode}`
                });
                
                await saveBasket();
                renderProducts();
                showMessage('✅ Produto adicionado (nome não identificado)', 'success');
                barcodeInput.value = '';
            } else {
                barcodeInput.value = originalText;
            }
        } else {
            // Produto encontrado
            userBasket.products.push({
                product_barcode: barcode,
                product_name: productName
            });
            
            await saveBasket();
            renderProducts();
            showMessage('✅ Produto adicionado com sucesso!', 'success');
            barcodeInput.value = '';
        }
        
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

// Abre modal para editar produto
function openEditModal(product) {
    const modal = document.getElementById('edit-product-modal');
    document.getElementById('edit-barcode').value = product.product_barcode;
    document.getElementById('edit-name').value = product.product_name || '';
    
    // Armazena o código de barras original para referência
    modal.setAttribute('data-original-barcode', product.product_barcode);
    modal.style.display = 'flex';
}

// Fecha modal de edição
function closeEditModal() {
    const modal = document.getElementById('edit-product-modal');
    modal.style.display = 'none';
}

// Salva edição do produto
async function saveProductEdit() {
    const modal = document.getElementById('edit-product-modal');
    const originalBarcode = modal.getAttribute('data-original-barcode');
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
    
    try {
        // Remove o produto antigo
        userBasket.products = userBasket.products.filter(p => p.product_barcode !== originalBarcode);
        
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
        closeEditModal();
        showMessage('✅ Produto atualizado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao editar produto:', error);
        showMessage('Erro ao editar produto', 'error');
    }
}

// Salva a cesta no servidor - CORRIGIDO (usando PATCH)
async function saveBasket() {
    try {
        console.log('💾 Salvando cesta:', userBasket);
        
        // CORREÇÃO: Use PATCH em vez de PUT
        const response = await authenticatedFetch('/api/basket', {
            method: 'PATCH',
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

// Exporta a cesta para JSON
function exportBasket() {
    if (userBasket.products.length === 0) {
        showMessage('A cesta está vazia', 'warning');
        return;
    }
    
    const basketData = {
        basket_name: userBasket.basket_name,
        products: userBasket.products,
        export_date: new Date().toISOString(),
        total_products: userBasket.products.length
    };
    
    const dataStr = JSON.stringify(basketData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `cesta-basica-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    showMessage('✅ Cesta exportada com sucesso!', 'success');
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
                    <button class="btn-icon edit-btn" onclick="openEditModal(${JSON.stringify(product).replace(/"/g, '&quot;')})" title="Editar produto">
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

// Exibe os resultados do cálculo
function displayResults(results) {
    displayCompleteBasket(results.best_complete_basket, results.complete_basket_results);
    displayMixedBasket(results.mixed_basket_results);
}

function displayCompleteBasket(bestBasket, allBaskets) {
    const container = document.getElementById('complete-basket-details');
    if (!container) return;
    
    if (!bestBasket) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">😕</div>
                <p>Nenhum mercado encontrou todos os produtos</p>
                <p>Tente selecionar mais mercados ou verificar os códigos de barras</p>
            </div>
        `;
        return;
    }
    
    const productsFound = bestBasket.products_found;
    const totalProducts = bestBasket.total_products;
    const coveragePercent = Math.round((productsFound / totalProducts) * 100);
    
    container.innerHTML = `
        <div class="price-highlight">R$ ${bestBasket.total.toFixed(2)}</div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>🏪 ${bestBasket.market_name}</strong></p>
            <p>📊 ${productsFound}/${totalProducts} produtos encontrados (${coveragePercent}%)</p>
        </div>
        
        <div class="product-list">
            <h4 style="margin-bottom: 10px;">📦 Produtos na Cesta:</h4>
            ${bestBasket.products.map(product => `
                <div class="product-item ${!product.found ? 'not-found' : ''}">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-barcode">${product.barcode}</div>
                    </div>
                    <div class="product-price">
                        ${product.found ? `R$ ${product.price.toFixed(2)}` : '❌ Não encontrado'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayMixedBasket(mixedBasket) {
    const container = document.getElementById('mixed-basket-details');
    const breakdownContainer = document.getElementById('mixed-breakdown');
    const marketBreakdown = document.getElementById('market-breakdown');
    
    if (!container) return;
    
    const foundProducts = mixedBasket.products.filter(p => p.found).length;
    const totalProducts = mixedBasket.products.length;
    
    container.innerHTML = `
        <div class="price-highlight">
            R$ ${mixedBasket.total.toFixed(2)}
            ${mixedBasket.economy_percent > 0 ? 
                `<span class="economy-badge">Economia de ${mixedBasket.economy_percent}%</span>` : 
                ''}
        </div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>📊 ${foundProducts}/${totalProducts} produtos encontrados</strong></p>
            <p>💰 Compre cada produto no mercado mais barato</p>
        </div>
        
        <div class="product-list">
            <h4 style="margin-bottom: 10px;">🛒 Produtos e Melhores Preços:</h4>
            ${mixedBasket.products.map(product => `
                <div class="product-item ${!product.found ? 'not-found' : ''}">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-barcode">${product.barcode}</div>
                        ${product.found ? `<small>🏪 ${product.market_name}</small>` : ''}
                    </div>
                    <div class="product-price">
                        ${product.found ? `R$ ${product.price.toFixed(2)}` : '❌ Não encontrado'}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Mostra breakdown por mercado se houver economia e múltiplos mercados
    if (mixedBasket.economy_percent > 0 && breakdownContainer && marketBreakdown && Object.keys(mixedBasket.market_breakdown).length > 1) {
        breakdownContainer.style.display = 'block';
        marketBreakdown.innerHTML = Object.values(mixedBasket.market_breakdown).map(market => `
            <div class="market-store">
                <h4>🏪 ${market.market_name}</h4>
                <div class="market-subtotal">Subtotal: R$ ${market.subtotal.toFixed(2)}</div>
                <div class="product-list">
                    ${market.products.map(product => `
                        <div class="product-item">
                            <div class="product-info">
                                <div class="product-name">${product.name}</div>
                            </div>
                            <div class="product-price">R$ ${product.price.toFixed(2)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } else if (breakdownContainer) {
        breakdownContainer.style.display = 'none';
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

// Mostra seção de login necessária
function showAuthRequired() {
    const loginSection = document.getElementById('login-section');
    const basketInterface = document.getElementById('basket-interface');
    
    if (loginSection) loginSection.style.display = 'block';
    if (basketInterface) basketInterface.style.display = 'none';
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
            
            // Mostra a interface da cesta
            const loginSection = document.getElementById('login-section');
            const basketInterface = document.getElementById('basket-interface');
            
            if (loginSection) loginSection.style.display = 'none';
            if (basketInterface) basketInterface.style.display = 'block';
            
            await Promise.all([
                loadUserBasket(),
                loadMarkets()
            ]);
            
            // Se for admin, carrega todas as cestas e mostra a seção
            if (isAdmin) {
                const adminSection = document.getElementById('admin-section');
                if (adminSection) {
                    adminSection.style.display = 'block';
                    await loadAllBaskets();
                }
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
