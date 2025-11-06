document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const clearSearchButton = document.getElementById('clearSearchButton');
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');

    // Filtros de Supermercado
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const marketSearchInput = document.getElementById('marketSearchInput');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarketsBtn = document.getElementById('selectAllMarkets');
    const deselectAllMarketsBtn = document.getElementById('deselectAllMarkets');
    const selectionCountSpan = document.querySelector('.selection-count');

    // Filtros de Resultados
    const resultsFiltersPanel = document.getElementById('resultsFilters');
    const marketFilterDropdown = document.getElementById('marketFilter');
    const sortFilterDropdown = document.getElementById('sortFilter');
    const clearFiltersButton = document.getElementById('clearFiltersButton');

    // --- ESTADO DA APLICAÇÃO ---
    let currentResults = [];
    let allMarkets = [];
    let marketMap = {};

    // --- FUNÇÕES DE UI E RENDERIZAÇÃO ---
    const showLoader = (show) => {
        if(loader) loader.style.display = show ? 'flex' : 'none';
    };

    const showMessage = (msg, isError = false) => {
        resultsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1">
                <h3 style="${isError ? 'color: var(--error);' : ''}">${msg}</h3>
                <p>Tente ajustar os termos da busca ou filtros.</p>
            </div>`;
    };

    const updateSelectionCount = () => {
        const selected = document.querySelectorAll('.market-card.selected').length;
        if (selectionCountSpan) selectionCountSpan.textContent = `${selected} selecionados`;
    };

    const buildProductCard = (item, allItemsInResult) => {
        const price = typeof item.preco_produto === 'number' 
            ? `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` 
            : 'N/A';

        const date = item.data_ultima_venda 
            ? new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') 
            : 'N/A';

        const marketData = marketMap[item.cnpj_supermercado];
        const address = marketData && marketData.endereco 
            ? marketData.endereco 
            : 'Endereço não disponível';

        const marketName = marketData && marketData.nome 
            ? marketData.nome 
            : (item.nome_supermercado || 'Supermercado');

        const prices = allItemsInResult.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const isCheapest = prices.length > 1 && item.preco_produto === minPrice;

        return `
        <div class="product-card-v2" data-cheapest="${isCheapest}">
            <div class="card-v2-header">
                <h3 class="product-v2-name">${item.nome_produto || 'Produto sem nome'}</h3>
                <div class="product-v2-price">${price}</div>
            </div>

            <div class="card-v2-body">
                <div class="detail-v2-item">
                    <i class="fas fa-store detail-v2-icon"></i>
                    <div class="detail-v2-text">
                        <span class="detail-v2-title">${marketName}</span>
                        <span class="detail-v2-subtitle">${address}</span>
                    </div>
                </div>
                <div class="detail-v2-item">
                    <i class="fas fa-box-open detail-v2-icon"></i>
                    <div class="detail-v2-text">
                        <span class="detail-v2-title">Unidade</span>
                        <span class="detail-v2-subtitle">${item.tipo_unidade || 'UN'}</span>
                    </div>
                </div>
                <div class="detail-v2-item">
                    <i class="fas fa-calendar-alt detail-v2-icon"></i>
                    <div class="detail-v2-text">
                        <span class="detail-v2-title">Última Venda</span>
                        <span class="detail-v2-subtitle">${date}</span>
                    </div>
                </div>
            </div>

            <div class="card-v2-footer">
                <i class="fas fa-barcode"></i>
                <span>${item.codigo_barras || 'Sem código de barras'}</span>
            </div>
        </div>`;
    };

    const applyFilters = () => {
        if (currentResults.length === 0) return;
        let filteredResults = [...currentResults];
        const selectedMarket = marketFilterDropdown.value;
        if (selectedMarket !== 'all') {
            filteredResults = filteredResults.filter(item => item.cnpj_supermercado === selectedMarket);
        }
        const sortBy = sortFilterDropdown.value;
        switch(sortBy) {
            case 'cheap': filteredResults.sort((a, b) => (a.preco_produto || Infinity) - (b.preco_produto || Infinity)); break;
            case 'expensive': filteredResults.sort((a, b) => (b.preco_produto || 0) - (a.preco_produto || 0)); break;
            case 'name': filteredResults.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || '')); break;
            case 'recent': default: filteredResults.sort((a, b) => new Date(b.data_ultima_venda) - new Date(a.data_ultima_venda)); break;
        }
        displayFilteredResults(filteredResults);
    };

    const displayFilteredResults = (results) => {
        if (results.length === 0) {
            resultsGrid.innerHTML = `<div class="empty-state"><h3>Nenhum resultado encontrado</h3><p>Tente ajustar os filtros aplicados</p></div>`;
            return;
        }
        const frag = document.createDocumentFragment();
        results.forEach((item) => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item, results);
            frag.appendChild(div.firstElementChild);
        });
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
    };

    const updateMarketFilter = (results) => {
        marketFilterDropdown.innerHTML = '<option value="all">Todos os mercados</option>';
        const markets = {};
        results.forEach(item => {
            if (item.cnpj_supermercado && item.nome_supermercado) {
                markets[item.cnpj_supermercado] = item.nome_supermercado;
            }
        });
        Object.entries(markets).forEach(([cnpj, nome]) => {
            const option = document.createElement('option');
            option.value = cnpj;
            option.textContent = nome;
            marketFilterDropdown.appendChild(option);
        });
    };

    const filterMarkets = (searchTerm) => {
        const filteredMarkets = allMarkets.filter(market => 
            market.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (market.endereco && market.endereco.toLowerCase().includes(searchTerm.toLowerCase()))
        );
        renderMarketFilters(filteredMarkets);
    };

    // --- LÓGICA DE BUSCA E INICIALIZAÇÃO ---
    const loadSupermarkets = async () => {
        try {
            console.log('Carregando supermercados...');

            // Tenta carregar os supermercados
            const response = await fetch('/api/supermarkets/public');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Supermercados carregados:', data);

            allMarkets = data;

            // Cria o mapa de mercados
            marketMap = {};
            allMarkets.forEach(market => {
                marketMap[market.cnpj] = {
                    nome: market.nome,
                    endereco: market.endereco
                };
            });

            // Renderiza os filtros
            renderMarketFilters(allMarkets);

        } catch (error) {
            console.error('Erro ao carregar supermercados:', error);
            supermarketFiltersContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Erro ao carregar supermercados</h3>
                    <p>${error.message}</p>
                    <button onclick="loadSupermarkets()" class="btn" style="margin-top: 1rem;">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>`;
        }
    };

    const renderMarketFilters = (marketsToRender) => {
        console.log('Renderizando', marketsToRender.length, 'mercados');

        if (!supermarketFiltersContainer) {
            console.error('Container de supermercados não encontrado!');
            return;
        }

        if (marketsToRender.length === 0) {
            supermarketFiltersContainer.innerHTML = `
                <div class="empty-state">
                    <h3>Nenhum supermercado encontrado</h3>
                    <p>Tente ajustar os termos da pesquisa</p>
                </div>`;
            return;
        }

        supermarketFiltersContainer.innerHTML = '';

        marketsToRender.forEach(market => {
            const card = document.createElement('div');
            card.className = 'market-card';
            card.innerHTML = `
                <input type="checkbox" name="supermarket" value="${market.cnpj}" style="display: none;">
                <div class="market-info">
                    <div class="market-name">${market.nome || 'Nome não disponível'}</div>
                    <div class="market-address">${market.endereco || 'Endereço não disponível'}</div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                const checkbox = card.querySelector('input');
                checkbox.checked = !checkbox.checked;
                card.classList.toggle('selected', checkbox.checked);
                updateSelectionCount();
            });

            supermarketFiltersContainer.appendChild(card);
        });

        updateSelectionCount();
        console.log('Mercados renderizados com sucesso');
    };

    const performSearch = async () => {
        const query = searchInput.value.trim();
        if (query.length < 3) {
            showMessage('Digite pelo menos 3 caracteres.'); 
            return;
        }

        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (selectedCnpjs.length === 0) {
            showMessage('Selecione ao menos um supermercado para busca em tempo real.'); 
            return;
        }

        showLoader(true);
        resultsGrid.innerHTML = '';
        currentResults = [];
        resultsFiltersPanel.style.display = 'none';

        // Inicializa barra de progresso usando a classe
        if (window.searchProgress) {
            window.searchProgress.initializeProgress(selectedCnpjs.length);
        }

        try {
            // Para demonstração: simula o progresso mercado a mercado
            const selectedMarkets = allMarkets.filter(market => selectedCnpjs.includes(market.cnpj));

            if (window.searchProgress && window.searchProgress.simulateMarketSearch) {
                await window.searchProgress.simulateMarketSearch(selectedMarkets);
            }

            const response = await authenticatedFetch('/api/realtime-search', { 
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    produto: query, 
                    cnpjs: selectedCnpjs 
                }) 
            });

            if (!response.ok) { 
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Erro ${response.status} na API.`);
            }

            const data = await response.json();
            currentResults = data.results || [];

            // Finaliza progresso com sucesso
            if (window.searchProgress) {
                window.searchProgress.completeProgress(true);
            }

            if (currentResults.length === 0) {
                showMessage(`Nenhum resultado encontrado para "${query}".`);
            } else {
                resultsFiltersPanel.style.display = 'block';
                updateMarketFilter(currentResults);
                applyFilters();
            }
        } catch (error) {
            console.error('Erro na busca:', error);
            if (window.searchProgress) {
                window.searchProgress.completeProgress(false);
            }
            showMessage(`Erro na busca: ${error.message}`, true);
        } finally {
            showLoader(false);
        }
    };

    // --- EVENTOS ---
    if (searchButton) {
        searchButton.addEventListener('click', performSearch);
    }

    if (searchInput) {
        searchInput.addEventListener('keypress', (event) => { 
            if (event.key === 'Enter') performSearch(); 
        });
    }

    if (clearSearchButton) {
        clearSearchButton.addEventListener('click', () => { 
            searchInput.value = ''; 
            resultsGrid.innerHTML = ''; 
            resultsFiltersPanel.style.display = 'none'; 
            if (window.searchProgress) {
                window.searchProgress.hideProgress();
            }
        });
    }

    if (marketFilterDropdown) {
        marketFilterDropdown.addEventListener('change', applyFilters);
    }

    if (sortFilterDropdown) {
        sortFilterDropdown.addEventListener('change', applyFilters);
    }

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => { 
            marketFilterDropdown.value = 'all'; 
            sortFilterDropdown.value = 'recent'; 
            applyFilters(); 
        });
    }

    if (marketSearchInput) {
        marketSearchInput.addEventListener('input', (e) => filterMarkets(e.target.value));
    }

    if (clearMarketSearch) {
        clearMarketSearch.addEventListener('click', () => {
            marketSearchInput.value = '';
            filterMarkets('');
        });
    }

    if (selectAllMarketsBtn) {
        selectAllMarketsBtn.addEventListener('click', () => {
            document.querySelectorAll('.market-card input').forEach(cb => { 
                cb.checked = true; 
                cb.parentElement.classList.add('selected'); 
            });
            updateSelectionCount();
        });
    }

    if (deselectAllMarketsBtn) {
        deselectAllMarketsBtn.addEventListener('click', () => {
            document.querySelectorAll('.market-card input').forEach(cb => { 
                cb.checked = false; 
                cb.parentElement.classList.remove('selected'); 
            });
            updateSelectionCount();
        });
    }

    // Inicialização
    console.log('Inicializando página de busca...');
    loadSupermarkets();

    // --- EXPOR RESULTADOS E NOTIFICAR PRICE-SORTER ---
    window.getCurrentResults = () => currentResults;

    const originalDisplayFilteredResults = window.displayFilteredResults;
    window.displayFilteredResults = function(results) {
        if (originalDisplayFilteredResults) {
            originalDisplayFilteredResults(results);
        }

        setTimeout(() => {
            if (window.priceSorter && typeof window.priceSorter.handleNewResults === 'function') {
                window.priceSorter.handleNewResults(results);
            }
        }, 100);
    };
});