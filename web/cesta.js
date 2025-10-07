// cesta.js - VERSÃO CORRIGIDA E MELHORADA
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
            console.log('🔐 Token expirado, tentando refresh...');
            await handleTokenRefresh();
            return authenticatedFetch(url, options);
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
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
        
        const response = await authenticatedFetch('/api/basket/');
        
        if (response.ok) {
            const basketData = await response.json();
            userBasket = basketData;
            console.log('✅ Cesta carregada:', userBasket);
            renderProducts();
            updateInterfaceState();
            showStepInstructions();
            return;
        } 
        
        if (response.status === 404) {
            console.log('ℹ️ Cesta não encontrada');
            userBasket = { id: null, basket_name: "Minha Cesta", products: [] };
            updateInterfaceState();
            showStepInstructions();
            return;
        }
        
        console.error('❌ Erro ao carregar cesta:', response.status);
        const errorText = await response.text();
        console.error('Detalhes do erro:', errorText);
        showMessage('Erro ao carregar sua cesta', 'error');
        
    } catch (error) {
        console.error('💥 Erro ao carregar cesta:', error);
        userBasket = { id: null, basket_name: "Minha Cesta", products: [] };
        updateInterfaceState();
        showStepInstructions();
    }
}

// Cria uma nova cesta para o usuário
async function createUserBasket() {
    try {
        console.log('🆕 Criando nova cesta...');
        const response = await authenticatedFetch('/api/basket/', {
            method: 'POST'
        });
        
        if (response.ok) {
            const basketData = await response.json();
            userBasket = basketData;
            console.log('✅ Cesta criada:', userBasket);
            renderProducts();
            updateInterfaceState();
            showStepInstructions();
            showMessage('✅ Cesta criada com sucesso! Agora adicione produtos.', 'success');
            return basketData;
        } else {
            const errorText = await response.text();
            console.error('❌ Erro ao criar cesta:', response.status, errorText);
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('💥 Erro ao criar cesta:', error);
        showMessage('Erro ao criar cesta: ' + error.message, 'error');
        throw error;
    }
}

// Adiciona produto à cesta
async function addProduct() {
    if (!userBasket.id) {
        showMessage('❌ Crie sua cesta básica primeiro', 'warning');
        return;
    }
    
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
        // Busca o nome do produto
        const productName = await getProductName(barcode);
        
        if (!productName) {
            if (confirm(`Produto com código ${barcode} não encontrado na base de dados. Deseja adicionar mesmo assim?`)) {
                userBasket.products.push({
                    product_barcode: barcode,
                    product_name: `Produto ${barcode}`
                });
                
                await saveBasket();
                renderProducts();
                updateInterfaceState();
                showStepInstructions();
                showMessage('✅ Produto adicionado (nome não identificado)', 'success');
                barcodeInput.value = '';
            } else {
                barcodeInput.value = originalText;
            }
        } else {
            userBasket.products.push({
                product_barcode: barcode,
                product_name: productName
            });
            
            await saveBasket();
            renderProducts();
            updateInterfaceState();
            showStepInstructions();
            showMessage('✅ Produto adicionado com sucesso!', 'success');
            barcodeInput.value = '';
        }
        
    } catch (error) {
        console.error('Erro ao adicionar produto:', error);
        showMessage('Erro ao adicionar produto: ' + error.message, 'error');
        barcodeInput.value = originalText;
    } finally {
        barcodeInput.disabled = false;
        barcodeInput.focus();
    }
}

// Busca o nome do produto pelo código de barras
async function getProductName(barcode) {
    try {
        console.log(`🔍 Buscando produto: ${barcode}`);
        
        const response = await authenticatedFetch(`/api/search-product?barcode=${encodeURIComponent(barcode)}`);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📦 Resultado da busca:', data);
            
            if (data.found && data.product) {
                return data.product.nome_produto;
            }
        } else if (response.status === 404) {
            console.log('ℹ️ Produto não encontrado na base de dados');
            return null;
        } else {
            console.warn('⚠️ Erro na busca do produto:', response.status);
            return null;
        }
        return null;
    } catch (error) {
        console.error('💥 Erro na busca do produto:', error);
        return null;
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
                userBasket.products = userBasket.products.filter(p => p.product_barcode !== barcode);
                renderProducts();
                updateInterfaceState();
                showStepInstructions();
                showMessage('✅ Produto removido com sucesso!', 'success');
            } else {
                throw new Error('Erro ao remover produto');
            }
        } catch (error) {
            console.error('Erro ao remover produto:', error);
            showMessage('Erro ao remover produto: ' + error.message, 'error');
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
                updateInterfaceState();
                showStepInstructions();
                showMessage('✅ Cesta limpa com sucesso!', 'success');
            } else {
                throw new Error('Erro ao limpar cesta');
            }
        } catch (error) {
            console.error('Erro ao limpar cesta:', error);
            showMessage('Erro ao limpar cesta: ' + error.message, 'error');
        }
    }
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
                <div class="step-instruction">
                    <p><strong>Passo 1 de 3:</strong> Adicione pelo menos 5 produtos</p>
                </div>
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
    
    // Adiciona instrução de progresso se ainda não tiver 5 produtos
    if (userBasket.products.length < 5) {
        const progressInfo = document.createElement('div');
        progressInfo.className = 'progress-info';
        progressInfo.innerHTML = `
            <div class="step-instruction">
                <p><strong>Progresso:</strong> ${userBasket.products.length}/5 produtos</p>
                <p>Adicione mais ${5 - userBasket.products.length} produtos para desbloquear a comparação de preços</p>
            </div>
        `;
        grid.appendChild(progressInfo);
    }
}

// Atualiza interface
function updateInterfaceState() {
    const productCount = userBasket.products.length;
    const marketSection = document.getElementById('market-selection-section');
    const progressAlert = document.getElementById('progress-alert');
    const resultsSection = document.getElementById('results-section');
    const calculateBtn = document.getElementById('calculate-btn');
    const createBasketSection = document.getElementById('create-basket-section');
    const addProductSection = document.getElementById('add-product-section');
    
    // Se não tem cesta criada
    if (!userBasket.id) {
        createBasketSection.style.display = 'block';
        addProductSection.style.display = 'none';
        marketSection.style.display = 'none';
        resultsSection.style.display = 'none';
        return;
    }
    
    // Se tem cesta criada
    createBasketSection.style.display = 'none';
    addProductSection.style.display = 'block';
    
    // Mostra/oculta seção de mercados baseado no número de produtos
    if (productCount >= 5) {
        marketSection.style.display = 'block';
        if (progressAlert) progressAlert.style.display = 'flex';
        if (calculateBtn) calculateBtn.disabled = false;
    } else {
        marketSection.style.display = 'none';
        if (progressAlert) progressAlert.style.display = 'none';
        resultsSection.style.display = 'none';
        if (calculateBtn) calculateBtn.disabled = true;
    }
    
    // Atualiza contador de produtos
    document.getElementById('product-count').textContent = productCount;
}

// Mostra instruções passo a passo
function showStepInstructions() {
    if (!userBasket.id) {
        showMessage('📝 Clique em "Criar Minha Cesta Básica" para começar', 'info');
        return;
    }
    
    const productCount = userBasket.products.length;
    
    if (productCount === 0) {
        showMessage('🔍 Comece adicionando produtos à sua cesta usando o código de barras', 'info');
    } else if (productCount < 5) {
        showMessage(`📝 Continue adicionando produtos (${productCount}/5) para desbloquear a comparação`, 'info');
    } else if (productCount >= 5 && selectedMarkets.size === 0) {
        showMessage('🏪 Agora selecione os mercados para comparar os preços', 'success');
    } else if (productCount >= 5 && selectedMarkets.size > 0) {
        showMessage('✅ Pronto! Clique em "Comparar Preços" para ver os resultados', 'success');
    }
}

// [Mantenha as outras funções: openEditModal, closeEditModal, saveProductEdit, saveBasket, loadMarkets, etc.]

// Inicialização
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
            
            // Inicializa a interface no estado correto
            updateInterfaceState();
            showStepInstructions();
            
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
