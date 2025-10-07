// cesta.js - VERSÃO FOCADA NAS FUNÇÕES ESSENCIAIS
let userBasket = { 
    id: null, 
    basket_name: "Minha Cesta", 
    products: [] 
};
let currentUser = null;
let isAdmin = false;

// =============================================
// FUNÇÕES PRINCIPAIS
// =============================================

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

// Carrega a cesta do usuário - CRIA AUTOMATICAMENTE SE NÃO EXISTIR
async function loadUserBasket() {
    try {
        console.log('🔍 Carregando cesta do usuário...');
        
        const response = await authenticatedFetch('/api/basket/');
        
        if (response.ok) {
            const basketData = await response.json();
            userBasket = basketData;
            console.log('✅ Cesta carregada:', userBasket);
            renderProducts();
            updateProductCount();
            return;
        } 
        
        console.error('❌ Erro ao carregar cesta:', response.status);
        showMessage('Erro ao carregar sua cesta', 'error');
        
    } catch (error) {
        console.error('💥 Erro ao carregar cesta:', error);
        showMessage('Erro ao carregar cesta: ' + error.message, 'error');
    }
}

// Cria uma nova cesta para o usuário (substitui a existente)
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
            updateProductCount();
            showMessage('✅ Nova cesta criada com sucesso!', 'success');
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
        
        if (!productName) {
            // Se não encontrou o produto, permite adicionar com nome personalizado
            const customName = prompt(`Produto com código ${barcode} não encontrado.\n\nDigite o nome do produto:`, `Produto ${barcode}`);
            
            if (customName !== null) { // Usuário não cancelou
                userBasket.products.push({
                    product_barcode: barcode,
                    product_name: customName || `Produto ${barcode}`
                });
                
                await saveBasket();
                renderProducts();
                updateProductCount();
                showMessage('✅ Produto adicionado com nome personalizado!', 'success');
                barcodeInput.value = '';
            } else {
                barcodeInput.value = originalText;
            }
        } else {
            // Produto encontrado, adiciona com o nome correto
            userBasket.products.push({
                product_barcode: barcode,
                product_name: productName
            });
            
            await saveBasket();
            renderProducts();
            updateProductCount();
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
                updateProductCount();
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
                updateProductCount();
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

// Função para editar produto
async function editProduct(barcode) {
    const product = userBasket.products.find(p => p.product_barcode === barcode);
    if (!product) return;
    
    const newName = prompt('Editar nome do produto:', product.product_name || '');
    if (newName !== null) {
        try {
            // Atualiza o nome localmente
            product.product_name = newName;
            
            // Salva no servidor
            await saveBasket();
            renderProducts();
            showMessage('✅ Produto atualizado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao editar produto:', error);
            showMessage('Erro ao editar produto', 'error');
        }
    }
}

// Renderiza os produtos
function renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="icon"><i class="fas fa-shopping-basket"></i></div>
                <h3>Sua cesta está vazia</h3>
                <p>Adicione produtos usando o código de barras acima</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = '';
    
    userBasket.products.forEach((product) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-content">
                <div class="product-actions">
                    <button class="btn-icon edit-btn" onclick="editProduct('${product.product_barcode}')" title="Editar produto">
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

// Atualiza contador de produtos
function updateProductCount() {
    const countElement = document.getElementById('product-count');
    if (countElement) {
        countElement.textContent = userBasket.products.length;
    }
}

// Salva a cesta no servidor
async function saveBasket() {
    try {
        console.log('💾 Salvando cesta:', userBasket);
        
        const response = await authenticatedFetch('/api/basket/', {
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

// =============================================
// FUNÇÕES DE ADMIN
// =============================================

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
    const adminSection = document.getElementById('admin-baskets-content');
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

// =============================================
// INICIALIZAÇÃO
// =============================================

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
    
    // Botão para criar nova cesta
    const createBasketBtn = document.getElementById('create-basket-btn');
    if (createBasketBtn) {
        createBasketBtn.addEventListener('click', createUserBasket);
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
            
            // Carrega a cesta do usuário (cria automaticamente se não existir)
            await loadUserBasket();
            
            // Se for admin, carrega todas as cestas
            if (isAdmin) {
                const adminSection = document.getElementById('admin-section');
                if (adminSection) {
                    adminSection.style.display = 'block';
                    await loadAllBaskets();
                }
            }
            
        } else {
            console.log('❌ Usuário não autenticado');
            showMessage('❌ Você precisa estar logado para usar a cesta básica', 'error');
        }
    } catch (error) {
        console.error('💥 Erro na inicialização:', error);
        showMessage('Erro ao carregar a página. Tente recarregar.', 'error');
    }
});
