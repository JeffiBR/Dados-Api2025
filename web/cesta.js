// cesta.js - Lógica da página da Cesta Básica (ATUALIZADO COM SELETOR MODERNO)
let userBasket = { products: [] };
let allMarkets = [];
let filteredMarkets = []; // Para a busca
let selectedMarkets = new Set();

// Função auxiliar para debounce (melhora a performance da busca)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

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
        const user = await getAuthUser();
        if (!user) {
            showAuthRequired();
            return;
        }

        const response = await authenticatedFetch('/api/basket');
        
        if (response.ok) {
            userBasket = await response.json();
            renderProducts();
            
            const basketInterface = document.querySelector('.basket-interface');
            if (basketInterface) basketInterface.style.display = 'block';
        } else if (response.status === 401) {
            showAuthRequired();
        } else {
            console.error('Erro ao carregar cesta:', response.status);
        }
    } catch (error) {
        console.error('Erro ao carregar cesta:', error);
        const user = await getAuthUser();
        if (!user) showAuthRequired();
    }
}

// Carrega a lista de mercados
async function loadMarkets() {
    try {
        const response = await fetch('/api/supermarkets/public');
        if (response.ok) {
            allMarkets = await response.json();
            filteredMarkets = [...allMarkets]; // Inicializa a lista filtrada
            renderMarketSelection();
        } else {
            document.getElementById('supermarketGrid').innerHTML = 
                '<p class="not-found">Erro ao carregar mercados</p>';
        }
    } catch (error) {
        console.error('Erro ao carregar mercados:', error);
        document.getElementById('supermarketGrid').innerHTML = 
            '<p class="not-found">Erro ao carregar mercados</p>';
    }
}

// Renderiza os produtos na grade
function renderProducts() {
    const grid = document.getElementById('products-grid');
    const countElement = document.getElementById('product-count');
    
    countElement.textContent = userBasket.products.length;
    
    if (userBasket.products.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" id="empty-state" style="grid-column: 1 / -1;">
                <div class="icon" style="font-size: 2rem; margin-bottom: 1rem;">🛒</div>
                <p>Sua cesta está vazia</p>
                <p>Adicione produtos usando o código de barras acima</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = '';
    
    userBasket.products.forEach((product, index) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card'; // Usando a classe genérica para estilo
        productCard.innerHTML = `
            <button class="remove-btn" onclick="removeProduct(${index})" title="Remover produto" style="position: absolute; top: 10px; right: 10px; z-index: 2;">×</button>
            <div class="product-info" style="padding: 1.5rem;">
                <div class="product-name">${product.product_name || 'Produto não identificado'}</div>
                <div class="product-barcode" style="font-size: 0.8rem; color: var(--muted-dark); margin-top: 5px;">Código: ${product.product_barcode}</div>
            </div>
        `;
        grid.appendChild(productCard);
    });
}


// == NOVA FUNÇÃO DE RENDERIZAÇÃO DE MERCADOS ==
function renderMarketSelection() {
    const grid = document.getElementById('supermarketGrid');
    if (!grid) return;

    if (!filteredMarkets || filteredMarkets.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">Nenhum mercado encontrado</div>';
        return;
    }

    grid.innerHTML = '';
    filteredMarkets.forEach(market => {
        const marketCard = document.createElement('div');
        marketCard.className = `market-card ${selectedMarkets.has(market.cnpj) ? 'selected' : ''}`;
        marketCard.dataset.cnpj = market.cnpj;
        marketCard.innerHTML = `
            <div class="market-info">
                <div class="market-name">${market.nome}</div>
                <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
            </div>
        `;
        marketCard.addEventListener('click', () => toggleMarketSelection(market.cnpj));
        grid.appendChild(marketCard);
    });
    updateSelectionCount();
}

// == NOVAS FUNÇÕES DE CONTROLE DO SELETOR ==
function toggleMarketSelection(cnpj) {
    if (selectedMarkets.has(cnpj)) {
        selectedMarkets.delete(cnpj);
    } else {
        selectedMarkets.add(cnpj);
    }
    // Re-renderiza apenas o card específico para melhor performance
    const card = document.querySelector(`.market-card[data-cnpj="${cnpj}"]`);
    if (card) {
        card.classList.toggle('selected');
    }
    updateSelectionCount();
}


function updateSelectionCount() {
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = `${selectedMarkets.size} selecionados`;
    }
}

function filterMarkets() {
    const searchTerm = document.getElementById('marketSearch').value.toLowerCase().trim();
    if (!searchTerm) {
        filteredMarkets = [...allMarkets];
    } else {
        filteredMarkets = allMarkets.filter(market =>
            market.nome.toLowerCase().includes(searchTerm) ||
            (market.endereco && market.endereco.toLowerCase().includes(searchTerm)) ||
            market.cnpj.includes(searchTerm)
        );
    }
    renderMarketSelection();
}

function clearMarketSearchFilter() {
    const searchInput = document.getElementById('marketSearch');
    if (searchInput) searchInput.value = '';
    filterMarkets();
}

function selectAllFilteredMarkets() {
    filteredMarkets.forEach(market => selectedMarkets.add(market.cnpj));
    renderMarketSelection();
}

function clearMarketSelection() {
    selectedMarkets.clear();
    renderMarketSelection();
}

// Adiciona um produto à cesta
async function addProduct() {
    const barcodeInput = document.getElementById('product-barcode');
    const barcode = barcodeInput.value.trim();
    
    if (!barcode || !/^\d{8,}$/.test(barcode)) {
        alert('Por favor, digite um código de barras válido (mínimo 8 números).');
        return;
    }
    
    if (userBasket.products.length >= 25) {
        alert('Limite de 25 produtos atingido.');
        return;
    }
    
    if (userBasket.products.some(p => p.product_barcode === barcode)) {
        alert('Este produto já está na cesta.');
        return;
    }
    
    let productName = 'Produto não identificado';
    try {
        const response = await authenticatedFetch(`/api/search?q=${encodeURIComponent(barcode)}`);
        if (response.ok) {
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const exactProduct = data.results.find(p => p.codigo_barras === barcode);
                productName = exactProduct ? exactProduct.nome_produto : data.results[0].nome_produto;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar nome do produto:', error);
    }
    
    userBasket.products.push({ product_barcode: barcode, product_name: productName });
    
    await saveBasket();
    renderProducts();
    barcodeInput.value = '';
    barcodeInput.focus();
}

// Remove um produto da cesta
async function removeProduct(index) {
    if (confirm('Tem certeza que deseja remover este produto da cesta?')) {
        userBasket.products.splice(index, 1);
        await saveBasket();
        renderProducts();
    }
}

// Salva a cesta no servidor
async function saveBasket() {
    try {
        const response = await authenticatedFetch('/api/basket', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userBasket)
        });
        if (!response.ok) {
            console.error('Erro ao salvar cesta');
            alert('Erro ao salvar cesta. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro de conexão. Tente novamente.');
    }
}

// Calcula os preços da cesta
async function calculateBasket() {
    if (userBasket.products.length === 0) {
        alert('Adicione produtos à cesta antes de calcular.');
        return;
    }
    
    if (selectedMarkets.size === 0) {
        alert('Selecione pelo menos um mercado.');
        return;
    }
    
    const calculateBtn = document.getElementById('calculate-btn');
    const resultsSection = document.getElementById('results-section');
    
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calculando...';
    if (resultsSection) resultsSection.style.display = 'block';
    
    const completeBasketDetails = document.getElementById('complete-basket-details');
    const mixedBasketDetails = document.getElementById('mixed-basket-details');
    const mixedBreakdown = document.getElementById('mixed-breakdown');
    
    if (completeBasketDetails) completeBasketDetails.innerHTML = '<div class="loading">Buscando preços...</div>';
    if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<div class="loading">Buscando preços...</div>';
    if (mixedBreakdown) mixedBreakdown.style.display = 'none';
    
    try {
        const response = await authenticatedFetch('/api/basket/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            if (completeBasketDetails) completeBasketDetails.innerHTML = '<p class="not-found">Erro no cálculo</p>';
            if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<p class="not-found">Erro no cálculo</p>';
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro de conexão. Verifique sua internet e tente novamente.');
        if (completeBasketDetails) completeBasketDetails.innerHTML = '<p class="not-found">Erro de conexão</p>';
        if (mixedBasketDetails) mixedBasketDetails.innerHTML = '<p class="not-found">Erro de conexão</p>';
    } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = '<i class="fas fa-calculator"></i> Calcular Melhores Preços';
    }
}

// Exibe os resultados
function displayResults(results) {
    displayCompleteBasket(results.best_complete_basket, results.complete_basket_results);
    displayMixedBasket(results.mixed_basket_results);
}

function displayCompleteBasket(bestBasket, allBaskets) {
    const container = document.getElementById('complete-basket-details');
    if (!container) return;
    
    if (!bestBasket) {
        container.innerHTML = `<div class="empty-state"><div class="icon">😕</div><p>Nenhum mercado encontrou todos os produtos</p><p>Tente selecionar mais mercados ou verificar os códigos de barras</p></div>`;
        return;
    }
    
    const coveragePercent = Math.round((bestBasket.products_found / bestBasket.total_products) * 100);
    container.innerHTML = `
        <div class="price-highlight" style="font-size: 2rem; font-weight: 800; color: var(--primary); text-align: center; margin-bottom: 1rem;">R$ ${bestBasket.total.toFixed(2)}</div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>🏪 ${bestBasket.market_name}</strong></p>
            <p>📊 ${bestBasket.products_found}/${bestBasket.total_products} produtos encontrados (${coveragePercent}%)</p>
        </div>
        <div class="product-list" style="max-height: 300px; overflow-y: auto; padding-right: 10px;">
            <h4 style="margin-bottom: 10px;">📦 Produtos na Cesta:</h4>
            ${bestBasket.products.map(p => `<div class="product-item ${!p.found ? 'not-found' : ''}"><div class="product-info"><div class="product-name">${p.name}</div><div class="product-barcode">${p.barcode}</div></div><div class="product-price">${p.found ? `R$ ${p.price.toFixed(2)}` : '❌ Não encontrado'}</div></div>`).join('')}
        </div>`;
}

function displayMixedBasket(mixedBasket) {
    const container = document.getElementById('mixed-basket-details');
    const breakdownContainer = document.getElementById('mixed-breakdown');
    const marketBreakdown = document.getElementById('market-breakdown');
    if (!container) return;
    
    const foundProducts = mixedBasket.products.filter(p => p.found).length;
    container.innerHTML = `
        <div class="price-highlight" style="font-size: 2rem; font-weight: 800; color: var(--primary); text-align: center; margin-bottom: 1rem;">
            R$ ${mixedBasket.total.toFixed(2)}
            ${mixedBasket.economy_percent > 0 ? `<span class="economy-badge" style="font-size: 0.8rem; background: var(--success); color: white; padding: 4px 8px; border-radius: 12px; margin-left: 10px;">Economia de ${mixedBasket.economy_percent}%</span>` : ''}
        </div>
        <div style="text-align: center; margin-bottom: 15px;">
            <p><strong>📊 ${foundProducts}/${mixedBasket.products.length} produtos encontrados</strong></p>
            <p>💰 Compre cada produto no mercado mais barato</p>
        </div>
        <div class="product-list" style="max-height: 300px; overflow-y: auto; padding-right: 10px;">
            <h4 style="margin-bottom: 10px;">🛒 Produtos e Melhores Preços:</h4>
            ${mixedBasket.products.map(p => `<div class="product-item ${!p.found ? 'not-found' : ''}"><div class="product-info"><div class="product-name">${p.name}</div><div class="product-barcode">${p.barcode}</div>${p.found ? `<small>🏪 ${p.market_name}</small>` : ''}</div><div class="product-price">${p.found ? `R$ ${p.price.toFixed(2)}` : '❌ Não encontrado'}</div></div>`).join('')}
        </div>`;
    
    if (mixedBasket.economy_percent > 0 && breakdownContainer && marketBreakdown && Object.keys(mixedBasket.market_breakdown).length > 1) {
        breakdownContainer.style.display = 'block';
        marketBreakdown.innerHTML = Object.values(mixedBasket.market_breakdown).map(m => `<div class="market-store" style="margin-bottom: 1.5rem;"><h4 style="border-bottom: 1px solid var(--border-dark); padding-bottom: 5px; margin-bottom: 10px;">🏪 ${m.market_name}</h4><div class="market-subtotal" style="font-weight: bold; margin-bottom: 10px;">Subtotal: R$ ${m.subtotal.toFixed(2)}</div><div class="product-list">${m.products.map(p => `<div class="product-item"><div class="product-info"><div class="product-name">${p.name}</div></div><div class="product-price">R$ ${p.price.toFixed(2)}</div></div>`).join('')}</div></div>`).join('');
    } else if (breakdownContainer) {
        breakdownContainer.style.display = 'none';
    }
}

function showAuthRequired() {
    const basketInterface = document.querySelector('.basket-interface');
    const loginSection = document.querySelector('.login-section');
    
    if(basketInterface) basketInterface.style.display = 'none';
    if(loginSection) loginSection.style.display = 'block';
}

// Função para limpar toda a cesta
async function clearBasket() {
    if (confirm('Tem certeza que deseja limpar toda a cesta? Esta ação não pode ser desfeita.')) {
        userBasket.products = [];
        await saveBasket();
        renderProducts();
        alert('Cesta limpa com sucesso!');
    }
}

// == INICIALIZAÇÃO DA PÁGINA ==
document.addEventListener('DOMContentLoaded', async function() {
    // Event listeners para o novo seletor de mercados
    const marketSearch = document.getElementById('marketSearch');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarketsBtn = document.getElementById('selectAllMarkets');
    const deselectAllMarketsBtn = document.getElementById('deselectAllMarkets');
    const barcodeInput = document.getElementById('product-barcode');
    const calculateBtn = document.getElementById('calculate-btn');

    if (marketSearch) marketSearch.addEventListener('input', debounce(filterMarkets, 300));
    if (clearMarketSearch) clearMarketSearch.addEventListener('click', clearMarketSearchFilter);
    if (selectAllMarketsBtn) selectAllMarketsBtn.addEventListener('click', selectAllFilteredMarkets);
    if (deselectAllMarketsBtn) deselectAllMarketsBtn.addEventListener('click', clearMarketSelection);
    if (barcodeInput) barcodeInput.addEventListener('keypress', e => { if (e.key === 'Enter') addProduct(); });
    if (calculateBtn) calculateBtn.addEventListener('click', calculateBasket);

    // Lógica de autenticação e carregamento de dados
    try {
        const user = await getAuthUser();
        if (user) {
            console.log('✅ Usuário autenticado, carregando cesta...');
            await loadUserBasket();
            await loadMarkets();
            
            const loginSection = document.querySelector('.login-section');
            if (loginSection) loginSection.style.display = 'none';
            
            const basketInterface = document.querySelector('.basket-interface');
            if (basketInterface) basketInterface.style.display = 'block';
            
        } else {
            console.log('❌ Usuário não autenticado');
            showAuthRequired();
        }
    } catch (error) {
        console.error('Erro na inicialização:', error);
        showAuthRequired();
    }
});

// Escuta mudanças de autenticação
window.addEventListener('authStateChange', (event) => {
    if (!event.detail.isAuthenticated) {
        showAuthRequired();
    }
});
