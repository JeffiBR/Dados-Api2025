// cesta.js - Lógica da página da Cesta Básica (COMPLETO ATUALIZADO)
let userBasket = { products: [] };
let allMarkets = [];
let selectedMarkets = new Set();

// Função auxiliar para verificar autenticação (compatível com auth.js)
async function checkUserAuth() {
    try {
        const session = await getSession();
        return !!session;
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        return false;
    }
}

// Carrega a cesta do usuário
async function loadUserBasket() {
    try {
        // Verifica autenticação primeiro
        const user = await getAuthUser();
        if (!user) {
            showAuthRequired();
            return;
        }

        const response = await authenticatedFetch('/api/basket');
        
        if (response.ok) {
            userBasket = await response.json();
            renderProducts();
            
            // Garante que a interface principal está visível
            const basketInterface = document.querySelector('.basket-interface');
            if (basketInterface) {
                basketInterface.style.display = 'block';
            }
        } else if (response.status === 401) {
            console.log('Sessão expirada');
            showAuthRequired();
        } else {
            console.error('Erro ao carregar cesta:', response.status);
        }
    } catch (error) {
        console.error('Erro ao carregar cesta:', error);
        // Em caso de erro de rede ou outros, tenta verificar se está autenticado
        const user = await getAuthUser();
        if (!user) {
            showAuthRequired();
        }
    }
}

// Carrega a lista de mercados
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

// Renderiza os produtos na grade
function renderProducts() {
    const grid = document.getElementById('products-grid');
    const countElement = document.getElementById('product-count');
    const emptyState = document.getElementById('empty-state');
    
    countElement.textContent = userBasket.products.length;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" id="empty-state">
                <div class="icon">🛒</div>
                <p>Sua cesta está vazia</p>
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
            <button class="remove-btn" onclick="removeProduct(${index})" title="Remover produto">×</button>
            <div class="product-info">
                <div class="product-name">${product.product_name || 'Produto não identificado'}</div>
                <div class="product-barcode">Código: ${product.product_barcode}</div>
            </div>
        `;
        grid.appendChild(productCard);
    });
}

// Renderiza a seleção de mercados NO ESTILO DA COMPARE.HTML
function renderMarketSelection() {
    const container = document.getElementById('market-selection');
    if (!container) return;
    
    if (!allMarkets || allMarkets.length === 0) {
        container.innerHTML = '<p class="not-found">Nenhum mercado disponível</p>';
        return;
    }
    
    container.innerHTML = '';
    
    // Adiciona o botão "Selecionar Todos" igual na compare.html
    const selectAllContainer = document.createElement('div');
    selectAllContainer.className = 'select-all-container';
    selectAllContainer.innerHTML = `
        <label class="market-checkbox compare-checkbox">
            <input type="checkbox" id="select-all-markets" onchange="toggleAllMarkets(this.checked)">
            <span class="checkmark"></span>
            <div class="market-info-compare">
                <div class="market-name">Selecionar Todos</div>
                <div class="market-address">Marcar/desmarcar todos os mercados</div>
            </div>
        </label>
    `;
    container.appendChild(selectAllContainer);
    
    // Container para os mercados em grid
    const marketsGrid = document.createElement('div');
    marketsGrid.className = 'markets-grid';
    
    allMarkets.forEach(market => {
        const marketCard = document.createElement('div');
        marketCard.className = 'market-card';
        marketCard.innerHTML = `
            <label class="market-checkbox compare-checkbox">
                <input type="checkbox" value="${market.cnpj}" onchange="toggleMarket('${market.cnpj}', this)">
                <span class="checkmark"></span>
                <div class="market-info-compare">
                    <div class="market-name">${market.nome}</div>
                    <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
                </div>
            </label>
        `;
        marketsGrid.appendChild(marketCard);
    });
    
    container.appendChild(marketsGrid);
}

// Seleciona/desmarca todos os mercados
function toggleAllMarkets(checked) {
    const checkboxes = document.querySelectorAll('#market-selection input[type="checkbox"]');
    
    checkboxes.forEach(checkbox => {
        if (checkbox.id !== 'select-all-markets') {
            checkbox.checked = checked;
            toggleMarket(checkbox.value, checkbox);
        }
    });
    
    showNotification(checked ? 'Todos os mercados selecionados' : 'Todos os mercados desmarcados', 'info');
}

// Gerencia a seleção de mercados
function toggleMarket(cnpj, checkboxElement) {
    if (checkboxElement.checked) {
        selectedMarkets.add(cnpj);
    } else {
        selectedMarkets.delete(cnpj);
    }
    
    // Atualiza o estado do "Selecionar Todos"
    updateSelectAllCheckbox();
}

// Atualiza o checkbox "Selecionar Todos"
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-markets');
    const allCheckboxes = document.querySelectorAll('#market-selection input[type="checkbox"]:not(#select-all-markets)');
    
    if (allCheckboxes.length === 0) return;
    
    const allChecked = Array.from(allCheckboxes).every(checkbox => checkbox.checked);
    const someChecked = Array.from(allCheckboxes).some(checkbox => checkbox.checked);
    
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = someChecked && !allChecked;
}

// Adiciona um produto à cesta - VERSÃO CORRIGIDA
async function addProduct() {
    const barcodeInput = document.getElementById('product-barcode');
    const barcode = barcodeInput.value.trim();
    
    if (!barcode) {
        showNotification('Por favor, digite um código de barras', 'error');
        return;
    }
    
    // Validação básica do código de barras
    if (!/^\d+$/.test(barcode)) {
        showNotification('Código de barras deve conter apenas números', 'error');
        return;
    }
    
    if (barcode.length < 8) {
        showNotification('Código de barras muito curto', 'error');
        return;
    }
    
    if (userBasket.products.length >= 25) {
        showNotification('Limite de 25 produtos atingido', 'error');
        return;
    }
    
    // Verifica se o produto já existe
    if (userBasket.products.some(p => p.product_barcode === barcode)) {
        showNotification('Este produto já está na cesta', 'warning');
        return;
    }
    
    // Adiciona produto temporariamente
    const tempProduct = {
        product_barcode: barcode,
        product_name: 'Buscando nome...'
    };
    userBasket.products.push(tempProduct);
    renderProducts();
    
    // Busca o nome do produto
    try {
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(barcode)}`);
        
        if (response.ok) {
            const data = await response.json();
            let productName = `Produto ${barcode}`;
            
            if (data.results && data.results.length > 0) {
                // Encontra o produto com o código de barras exato
                const exactProduct = data.results.find(p => p.codigo_barras === barcode);
                if (exactProduct) {
                    productName = exactProduct.nome_produto;
                } else if (data.results.length > 0) {
                    productName = data.results[0].nome_produto;
                }
            }
            
            // Atualiza o nome do produto
            const productIndex = userBasket.products.findIndex(p => p.product_barcode === barcode);
            if (productIndex !== -1) {
                userBasket.products[productIndex].product_name = productName;
                renderProducts();
            }
        }
    } catch (error) {
        console.error('Erro ao buscar nome do produto:', error);
        // Mantém o nome padrão se houver erro
    }
    
    // Salva a cesta no servidor
    await saveBasket();
    barcodeInput.value = '';
    barcodeInput.focus();
    
    showNotification('Produto adicionado à cesta', 'success');
}

// Remove um produto da cesta
async function removeProduct(index) {
    if (confirm('Tem certeza que deseja remover este produto da cesta?')) {
        userBasket.products.splice(index, 1);
        await saveBasket();
        renderProducts();
        showNotification('Produto removido da cesta', 'success');
    }
}

// Salva a cesta no servidor - VERSÃO CORRIGIDA
async function saveBasket() {
    try {
        console.log('Salvando cesta:', userBasket);
        
        const response = await authenticatedFetch('/api/basket', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: userBasket.id,
                user_id: userBasket.user_id,
                basket_name: userBasket.basket_name || 'Minha Cesta',
                products: userBasket.products
            })
        });
        
        if (response.ok) {
            const savedBasket = await response.json();
            userBasket.id = savedBasket.id; // Garante que temos o ID
            userBasket.user_id = savedBasket.user_id; // Garante que temos o user_id
            console.log('Cesta salva com sucesso:', savedBasket);
        } else {
            const errorText = await response.text();
            console.error('Erro ao salvar cesta:', response.status, errorText);
            
            if (response.status === 404) {
                // Cesta não existe, vamos criar uma nova
                await createNewBasket();
            } else {
                showNotification('Erro ao salvar cesta. Tente novamente.', 'error');
            }
        }
    } catch (error) {
        console.error('Erro na requisição saveBasket:', error);
        showNotification('Erro de conexão. Tente novamente.', 'error');
    }
}

// Cria uma nova cesta quando não existe
async function createNewBasket() {
    try {
        const response = await authenticatedFetch('/api/basket', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                basket_name: 'Minha Cesta',
                products: userBasket.products
            })
        });
        
        if (response.ok) {
            const newBasket = await response.json();
            userBasket = newBasket;
            console.log('Nova cesta criada:', newBasket);
            showNotification('Nova cesta criada com sucesso', 'success');
        } else {
            console.error('Erro ao criar nova cesta:', response.status);
            showNotification('Erro ao criar nova cesta', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar nova cesta:', error);
        showNotification('Erro ao criar nova cesta', 'error');
    }
}

// Calcula os preços da cesta
async function calculateBasket() {
    if (userBasket.products.length === 0) {
        showNotification('Adicione produtos à cesta antes de calcular', 'warning');
        return;
    }
    
    if (selectedMarkets.size === 0) {
        showNotification('Selecione pelo menos um mercado', 'warning');
        return;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    
    calculateBtn.disabled = true;
    calculateBtn.textContent = '🔄 Calculando...';
    if (resultsSection) resultsSection.style.display = 'block';
    
    // Mostra loading nos resultados
    const completeBasketDetails = document.getElementById('complete-basket-details');
    const mixedBasketDetails = document.getElementById('mixed-basket-details');
    const mixedBreakdown = document.getElementById('mixed-breakdown');
    
    if (completeBasketDetails) completeBasketDetails.innerHTML = '<div class="loading">Buscando preços...</div>';
    if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<div class="loading">Buscando preços...</div>';
    if (mixedBreakdown) mixedBreakdown.style.display = 'none';
    
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
            showNotification('Cálculo concluído com sucesso', 'success');
        } else {
            const errorText = await response.text();
            console.error('Erro ao calcular preços:', errorText);
            showNotification('Erro ao calcular preços. Tente novamente.', 'error');
            
            if (completeBasketDetails) completeBasketDetails.innerHTML = '<p class="not-found">Erro no cálculo</p>';
            if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<p class="not-found">Erro no cálculo</p>';
        }
    } catch (error) {
        console.error('Erro:', error);
        showNotification('Erro de conexão. Verifique sua internet e tente novamente.', 'error');
        
        if (completeBasketDetails) completeBasketDetails.innerHTML = '<p class="not-found">Erro de conexão</p>';
        if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<p class="not-found">Erro de conexão</p>';
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.textContent = '🧮 Calcular Melhores Preços';
    }
}

// Exibe os resultados
function displayResults(results) {
    // Cesta completa mais barata
    displayCompleteBasket(results.best_complete_basket, results.complete_basket_results);
    
    // Cesta mista
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

function showAuthRequired() {
    const grid = document.getElementById('products-grid');
    const marketSection = document.getElementById('market-selection');
    
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <div class="icon">🔒</div>
                <h3>Login Necessário</h3>
                <p>Faça login para gerenciar sua cesta básica</p>
                <button onclick="window.location.href='/login.html'" class="btn-primary" style="margin-top: 15px;">
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
    
    // Mostra a seção de login e esconde a interface da cesta
    const loginSection = document.querySelector('.login-section');
    const basketInterface = document.querySelector('.basket-interface');
    
    if (loginSection) loginSection.style.display = 'block';
    if (basketInterface) basketInterface.style.display = 'none';
}

// Função para mostrar notificações
function showNotification(message, type = 'info') {
    // Remove notificação anterior se existir
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : type === 'warning' ? 'exclamation-circle' : 'info'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Mostra a notificação
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Remove após 3 segundos
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Função para limpar toda a cesta
async function clearBasket() {
    if (confirm('Tem certeza que deseja limpar toda a cesta? Esta ação não pode ser desfeita.')) {
        userBasket.products = [];
        await saveBasket();
        renderProducts();
        showNotification('Cesta limpa com sucesso!', 'success');
    }
}

// Permitir adicionar produto com Enter
document.addEventListener('DOMContentLoaded', async function() {
    const barcodeInput = document.getElementById('product-barcode');
    if (barcodeInput) {
        barcodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addProduct();
            }
        });
    }
    
    // INICIALIZAÇÃO CORRIGIDA
    try {
        // Verifica autenticação usando as funções atualizadas do auth.js
        const user = await getAuthUser();
        
        if (user) {
            console.log('✅ Usuário autenticado, carregando cesta...');
            await loadUserBasket();
            await loadMarkets();
            
            // Esconde a seção de login se estiver visível
            const loginSection = document.querySelector('.login-section');
            if (loginSection) {
                loginSection.style.display = 'none';
            }
            
            // Mostra a interface principal da cesta
            const basketInterface = document.querySelector('.basket-interface');
            if (basketInterface) {
                basketInterface.style.display = 'block';
            }
        } else {
            console.log('❌ Usuário não autenticado');
            showAuthRequired();
        }
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showAuthRequired();
    }
});

// Escuta mudanças de autenticação (opcional, para casos de logout em outras abas)
window.addEventListener('authStateChange', (event) => {
    if (!event.detail.isAuthenticated) {
        showAuthRequired();
    }
});
