document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI (Mapeados para o seu novo HTML) ---
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const realtimeSearchButton = document.getElementById('realtimeSearchButton');
    const clearSearchButton = document.getElementById('clearSearchButton'); // Corrigido de clearButton
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');

    // Filtros de busca (painel superior)
    const marketSearchInput = document.getElementById('marketSearchInput');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const selectionCount = document.querySelector('.selection-count');
    
    // Filtros de resultados (painel inferior)
    const resultsFiltersPanel = document.getElementById('resultsFilters');
    const marketFilterDropdown = document.getElementById('marketFilter');
    const sortFilterDropdown = document.getElementById('sortFilter');
    const clearFiltersButton = document.getElementById('clearFiltersButton');

    // --- ESTADO DA APLICAÇÃO ---
    let allResults = [];
    let allMarkets = [];

    // --- FUNÇÕES DE UI E RENDERIZAÇÃO ---
    const showLoader = (show) => loader.classList.toggle('hidden', !show);

    const showNotification = (message, type = 'success') => {
        // Implementação de notificação (pode ser a mesma do seu admin.js)
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    };

    const buildProductCard = (item, allItemsInResult) => {
        const price = typeof item.preco_produto === 'number' ? `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        const date = item.data_ultima_venda ? new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        
        const prices = allItemsInResult.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        let priceClass = '';
        if (prices.length > 1 && item.preco_produto === minPrice) {
            priceClass = 'cheapest-price';
        }

        return `<div class="product-card ${priceClass}" data-price="${item.preco_produto || 0}">
            <div class="card-header"><div class="product-name">${item.nome_produto || 'Produto sem nome'}</div></div>
            <div class="price-section"><div class="product-price">${price}</div></div>
            <ul class="product-details">
                <li><i class="fas fa-store"></i> <span class="supermarket-name">${item.nome_supermercado}</span></li>
                <li><i class="fas fa-weight-hanging"></i> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li>
                <li><i class="fas fa-calendar-alt"></i> <span class="sale-date">Última Venda: ${date}</span></li>
                <li><i class="fas fa-barcode"></i> ${item.codigo_barras || 'Sem código'}</li>
            </ul>
        </div>`;
    };

    const renderFilteredResults = () => {
        if (allResults.length === 0) return;
        
        let filtered = [...allResults];
        const selectedMarket = marketFilterDropdown.value;
        const sortBy = sortFilterDropdown.value;

        if (selectedMarket !== 'all') {
            filtered = filtered.filter(item => item.cnpj_supermercado === selectedMarket);
        }

        switch(sortBy) {
            case 'cheap': filtered.sort((a, b) => (a.preco_produto || Infinity) - (b.preco_produto || Infinity)); break;
            case 'expensive': filtered.sort((a, b) => (b.preco_produto || 0) - (a.preco_produto || 0)); break;
            case 'name': filtered.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || '')); break;
            case 'recent': default: filtered.sort((a, b) => new Date(b.data_ultima_venda) - new Date(a.data_ultima_venda)); break;
        }

        if (filtered.length > 0) {
            resultsGrid.innerHTML = filtered.map(item => buildProductCard(item, filtered)).join('');
        } else {
            resultsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1"><h3>Nenhum resultado para os filtros aplicados.</h3></div>`;
        }
    };

    const populateResultFilters = () => {
        marketFilterDropdown.innerHTML = '<option value="all">Todos os mercados</option>';
        const marketsInResults = allResults.reduce((acc, item) => {
            if (item.cnpj_supermercado && !acc[item.cnpj_supermercado]) {
                acc[item.cnpj_supermercado] = item.nome_supermercado;
            }
            return acc;
        }, {});
        for (const [cnpj, nome] of Object.entries(marketsInResults)) {
            marketFilterDropdown.innerHTML += `<option value="${cnpj}">${nome}</option>`;
        }
    };

    // --- LÓGICA DE BUSCA ---
    const loadSupermarkets = async () => {
        try {
            allMarkets = await fetch(`/api/supermarkets/public`).then(res => res.json());
            renderMarketFilters(allMarkets);
        } catch (error) { console.error('Erro ao carregar supermercados:', error); }
    };
    
    const renderMarketFilters = (marketsToRender) => {
        supermarketFiltersContainer.innerHTML = '';
        const frag = document.createDocumentFragment();
        marketsToRender.forEach(market => {
            const label = document.createElement('label');
            label.className = 'market-card';
            label.innerHTML = `<input type="checkbox" name="supermarket" value="${market.cnpj}" style="display: none;"><div class="market-info"><span class="market-name">${market.nome}</span><span class="market-cnpj">${market.cnpj}</span></div>`;
            label.addEventListener('click', (e) => {
                e.preventDefault();
                const checkbox = label.querySelector('input');
                checkbox.checked = !checkbox.checked;
                label.classList.toggle('selected', checkbox.checked);
                updateSelectionCount();
            });
            frag.appendChild(label);
        });
        supermarketFiltersContainer.appendChild(frag);
        updateSelectionCount();
    };

    const updateSelectionCount = () => {
        const count = document.querySelectorAll('#supermarketFilters input:checked').length;
        if (selectionCount) selectionCount.textContent = `${count} selecionado(s)`;
    };

    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) { alert('Digite pelo menos 3 caracteres.'); return; }
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) { alert('Selecione ao menos um supermercado para busca em tempo real.'); return; }

        showLoader(true);
        resultsGrid.innerHTML = '';
        allResults = [];
        resultsFiltersPanel.style.display = 'none';

        try {
            let response;
            if (isRealtime) {
                response = await authenticatedFetch('/api/realtime-search', { method: 'POST', body: JSON.stringify({ produto: query, cnpjs: selectedCnpjs }) });
            } else {
                let url = `/api/search?q=${encodeURIComponent(query)}`;
                if (selectedCnpjs.length > 0) url += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
                response = await authenticatedFetch(url);
            }

            if (!response.ok) { const err = await response.json(); throw new Error(err.detail); }
            
            const data = await response.json();
            allResults = data.results || [];
            
            if (allResults.length === 0) {
                resultsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1"><h3>Nenhum resultado encontrado para "${query}".</h3></div>`;
            } else {
                resultsFiltersPanel.style.display = 'block';
                populateResultFilters();
                renderFilteredResults();
            }
        } catch (error) {
            console.error(error);
            resultsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1"><h3>Erro na busca: ${error.message}</h3></div>`;
        } finally {
            showLoader(false);
        }
    };

    // --- EVENT LISTENERS ---
    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchButton.style.display = 'none';
        resultsGrid.innerHTML = '';
        resultsFiltersPanel.style.display = 'none';
    });
    searchInput.addEventListener('input', () => { clearSearchButton.style.display = searchInput.value ? 'block' : 'none'; });
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    searchInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') performSearch(false); });
    
    marketSearchInput.addEventListener('input', (e) => filterMarkets(e.target.value));
    clearMarketSearch.addEventListener('click', () => { marketSearchInput.value = ''; filterMarkets(''); });
    selectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('#supermarketFilters input').forEach(cb => { cb.checked = true; cb.parentElement.classList.add('selected'); });
        updateSelectionCount();
    });
    deselectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('#supermarketFilters input').forEach(cb => { cb.checked = false; cb.parentElement.classList.remove('selected'); });
        updateSelectionCount();
    });

    sortFilterDropdown.addEventListener('change', renderFilteredResults);
    marketFilterDropdown.addEventListener('change', renderFilteredResults);
    clearFiltersButton.addEventListener('click', () => {
        marketFilterDropdown.value = 'all';
        sortFilterDropdown.value = 'recent';
        renderFilteredResults();
    });

    loadSupermarkets();
});
