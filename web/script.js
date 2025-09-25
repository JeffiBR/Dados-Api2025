document.addEventListener('DOMContentLoaded', () => {
    // Elementos
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const realtimeSearchButton = document.getElementById('realtimeSearchButton');
    const clearSearchButton = document.getElementById('clearSearchButton');
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const resultsFilters = document.getElementById('resultsFilters');
    const marketFilter = document.getElementById('marketFilter');
    const sortFilter = document.getElementById('sortFilter');
    const clearFiltersButton = document.getElementById('clearFiltersButton');
    
    // Elementos do menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const logoutBtn = document.getElementById('logoutBtn');
    const themeToggle = document.getElementById('themeToggle');

    // Elementos para filtros de mercado
    const marketSearchInput = document.getElementById('marketSearchInput');
    const clearMarketSearch = document.getElementById('clearMarketSearch');
    const selectAllMarkets = document.getElementById('selectAllMarkets');
    const deselectAllMarkets = document.getElementById('deselectAllMarkets');
    const selectionCount = document.querySelector('.selection-count');

    // Variáveis para armazenar estado
    let currentResults = [];
    let currentQuery = '';
    let allMarkets = [];

    // Função para obter a sessão do usuário
    const getSession = async () => {
        try {
            const token = localStorage.getItem('supabase.auth.token');
            if (!token) return null;
            
            const tokenData = JSON.parse(token);
            if (!tokenData || !tokenData.access_token) return null;
            
            const currentTime = Math.floor(Date.now() / 1000);
            if (tokenData.expires_at && tokenData.expires_at < currentTime) {
                localStorage.removeItem('supabase.auth.token');
                return null;
            }
            
            return tokenData;
        } catch (error) {
            console.error('Erro ao obter sessão:', error);
            return null;
        }
    };

    // Menu mobile
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
    }

    // Dropdown do usuário
    if (userMenuBtn) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('show');
        });
    }

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', () => {
        userDropdown.classList.remove('show');
    });

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('supabase.auth.token');
            window.location.href = '/login.html';
        });
    }

    // Toggle do tema
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const icon = themeToggle.querySelector('i');
            if (document.body.classList.contains('light-mode')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        });
    }

    // Utilitários - Versão simplificada do código enviado
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

    const showNotification = (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    };

    // Atualizar contador de seleção - Versão simplificada
    const updateSelectionCount = () => {
        const selected = document.querySelectorAll('.market-card.selected').length;
        if (selectionCount) selectionCount.textContent = `${selected} selecionados`;
    };

    // Filtrar mercados na pesquisa - Versão melhorada do código enviado
    const filterMarkets = (searchText) => {
        const searchTerm = searchText.toLowerCase();
        const filteredMarkets = allMarkets.filter(market => 
            market.nome.toLowerCase().includes(searchTerm) || market.cnpj.includes(searchTerm)
        );
        renderMarketFilters(filteredMarkets);
    };

    // Renderização de cards de mercado - Versão do código enviado
    const buildMarketCard = (market) => {
        const card = document.createElement('div');
        card.className = 'market-card';
        card.innerHTML = `
            <input type="checkbox" name="supermarket" value="${market.cnpj}" style="display: none;">
            <div class="market-info">
                <div class="market-name">${market.nome}</div>
                <div class="market-cnpj">${market.cnpj}</div>
            </div>
        `;
        
        card.addEventListener('click', (e) => {
            if (!e.target.matches('input')) {
                const checkbox = card.querySelector('input');
                checkbox.checked = !checkbox.checked;
                card.classList.toggle('selected', checkbox.checked);
                updateSelectionCount();
            }
        });
        
        return card;
    };

    // Renderização eficiente de filtros de mercado - Versão do código enviado
    const renderMarketFilters = (marketsToRender) => {
        supermarketFiltersContainer.innerHTML = '';
        marketsToRender.forEach(market => {
            const card = buildMarketCard(market);
            supermarketFiltersContainer.appendChild(card);
        });
        updateSelectionCount();
    };

    // Selecionar/Deselecionar todos os mercados - Versão do código enviado
    selectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card input').forEach(cb => {
            cb.checked = true;
            cb.parentElement.classList.add('selected');
        });
        updateSelectionCount();
    });

    deselectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card input').forEach(cb => {
            cb.checked = false;
            cb.parentElement.classList.remove('selected');
        });
        updateSelectionCount();
    });

    // Limpar pesquisa de mercados
    clearMarketSearch.addEventListener('click', () => {
        marketSearchInput.value = '';
        renderMarketFilters(allMarkets);
    });

    // Pesquisa em tempo real nos mercados - Versão do código enviado
    marketSearchInput.addEventListener('input', (e) => {
        filterMarkets(e.target.value);
    });

    // Renderização de cards de produto - Combinação das duas versões
    const buildProductCard = (item, allItemsInResult) => {
        const price = typeof item.preco_produto === 'number' ? 
            `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        
        const date = item.data_ultima_venda ? 
            new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        
        // Calcular estatísticas de preço (do script original)
        const prices = allItemsInResult.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        
        // Determinar classe de preço (combinação)
        let priceClass = '';
        if (prices.length > 1) {
            if (item.preco_produto === minPrice) {
                priceClass = 'cheapest-price';
            } else if (item.preco_produto === maxPrice) {
                priceClass = 'expensive-price';
            }
        }
        
        // Calcular diferença da média (do script original)
        let avgIndicator = '';
        if (prices.length > 1 && typeof item.preco_produto === 'number') {
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            if (avgPrice > 0) {
                const diffFromAvg = ((item.preco_produto - avgPrice) / avgPrice * 100).toFixed(1);
                if (item.preco_produto < avgPrice) {
                    avgIndicator = `<span class="avg-indicator below">${Math.abs(diffFromAvg)}% abaixo da média</span>`;
                } else if (item.preco_produto > avgPrice) {
                    avgIndicator = `<span class="avg-indicator above">${diffFromAvg}% acima da média</span>`;
                }
            }
        }

        return `
        <div class="product-card ${priceClass}" data-price="${item.preco_produto || 0}">
            <div class="card-header">
                <div class="product-name">${item.nome_produto || 'Produto sem nome'}</div>
            </div>
            <div class="price-section">
                <div class="product-price">${price}</div>
                ${avgIndicator}
            </div>
            <ul class="product-details">
                <li><i class="fas fa-store"></i> 
                    <span class="supermarket-name">${item.nome_supermercado}</span>
                </li>
                <li><i class="fas fa-weight-hanging"></i> 
                    ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})
                </li>
                <li><i class="fas fa-calendar-alt"></i> 
                    <span class="sale-date">Última Venda: ${date}</span>
                </li>
                <li><i class="fas fa-barcode"></i> 
                    ${item.codigo_barras || 'Sem código'}
                </li>
            </ul>
        </div>`;
    };

    // Função para aplicar filtros aos resultados - Versão simplificada do código enviado
    const applyFilters = () => {
        if (currentResults.length === 0) return;
        
        let filteredResults = [...currentResults];
        
        // Filtrar por mercado
        const selectedMarket = marketFilter.value;
        if (selectedMarket !== 'all') {
            filteredResults = filteredResults.filter(item => item.cnpj_supermercado === selectedMarket);
        }
        
        // Ordenar resultados - Versão do código enviado com opções
        const sortBy = sortFilter.value;
        switch(sortBy) {
            case 'cheap': 
                filteredResults.sort((a, b) => (a.preco_produto || Infinity) - (b.preco_produto || Infinity)); 
                break;
            case 'expensive': 
                filteredResults.sort((a, b) => (b.preco_produto || 0) - (a.preco_produto || 0)); 
                break;
            case 'name': 
                filteredResults.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || '')); 
                break;
            case 'recent': 
            default: 
                filteredResults.sort((a, b) => new Date(b.data_ultima_venda || 0) - new Date(a.data_ultima_venda || 0)); 
                break;
        }
        
        // Exibir resultados filtrados
        displayFilteredResults(filteredResults);
    };

    // Exibir resultados filtrados - Combinação das duas versões
    const displayFilteredResults = (results) => {
        if (results.length === 0) {
            resultsGrid.innerHTML = `
                <div class="empty-state">
                    <h3>Nenhum resultado encontrado</h3>
                    <p>Tente ajustar os filtros aplicados</p>
                </div>`;
            return;
        }
        
        // Adicionar contador de resultados com estatísticas (do script original)
        const prices = results.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length ? Math.min(...prices).toFixed(2).replace('.', ',') : '0,00';
        const maxPrice = prices.length ? Math.max(...prices).toFixed(2).replace('.', ',') : '0,00';
        const avgPrice = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2).replace('.', ',') : '0,00';
        
        let html = `
        <div class="results-summary">
            <div class="summary-stats">
                <div class="stat">
                    <span class="stat-value">${results.length}</span>
                    <span class="stat-label">produtos encontrados</span>
                </div>
                <div class="stat">
                    <span class="stat-value">R$ ${minPrice}</span>
                    <span class="stat-label">menor preço</span>
                </div>
                <div class="stat">
                    <span class="stat-value">R$ ${maxPrice}</span>
                    <span class="stat-label">maior preço</span>
                </div>
                <div class="stat">
                    <span class="stat-value">R$ ${avgPrice}</span>
                    <span class="stat-label">preço médio</span>
                </div>
            </div>
        </div>`;
        
        // Adicionar cards de produtos (versão simplificada do código enviado)
        html += results.map((item) => buildProductCard(item, results)).join('');
        
        resultsGrid.innerHTML = html;
    };

    // Atualizar filtro de mercados com base nos resultados - Versão do código enviado
    const updateMarketFilter = (results) => {
        while (marketFilter.options.length > 1) marketFilter.remove(1);
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
            marketFilter.appendChild(option);
        });
    };

    // Carregar supermercados - Versão simplificada do código enviado
    const loadSupermarkets = async () => {
        try {
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados.');
            allMarkets = await response.json();
            renderMarketFilters(allMarkets);
        } catch (error) {
            console.error(error);
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
        }
    };

    // Função authenticatedFetch do código enviado
    const authenticatedFetch = async (url, options = {}) => {
        const session = await getSession();
        const headers = { 
            'Content-Type': 'application/json', 
            ...options.headers 
        };
        
        if (session) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        
        const response = await fetch(url, { ...options, headers });
        
        if (response.status === 401) {
            showMessage('Sua sessão expirou. Faça login novamente.');
            setTimeout(() => window.location.href = '/login.html', 1200);
            throw new Error("Sessão não encontrada.");
        }
        
        return response;
    };

    // Nova busca - Versão do código enviado com melhorias
    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) {
            showMessage('Digite pelo menos 3 caracteres.');
            return;
        }
        
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) {
            showMessage('Selecione ao menos um supermercado para busca em tempo real.');
            return;
        }

        showLoader(true);
        resultsGrid.innerHTML = '';
        currentResults = [];
        resultsFilters.style.display = 'none';

        try {
            let response;
            
            if (isRealtime) {
                response = await authenticatedFetch('/api/realtime-search', {
                    method: 'POST',
                    body: JSON.stringify({ produto: query, cnpjs: selectedCnpjs })
                });
            } else {
                let url = `/api/search?q=${encodeURIComponent(query)}`;
                if (selectedCnpjs.length > 0) {
                    url += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
                }
                response = await authenticatedFetch(url);
            }

            if (!response.ok) { 
                const err = await response.json();
                throw new Error(err.detail || `Erro ${response.status} na API.`);
            }
            
            const data = await response.json();
            currentResults = data.results || [];
            currentQuery = query;
            
            if (currentResults.length === 0) {
                showMessage(`Nenhum resultado encontrado para "${query}".`);
            } else {
                resultsFilters.style.display = 'block';
                updateMarketFilter(currentResults);
                applyFilters();
                showNotification(`Encontramos ${currentResults.length} resultado(s) para "${query}"`);
            }
        } catch (error) {
            if (error.message !== "Sessão não encontrada.") {
                console.error('Erro na busca:', error);
                showMessage(`Erro na busca: ${error.message}`, true);
                showNotification('Erro ao realizar a busca', 'error');
            }
        } finally {
            showLoader(false);
        }
    };

    // Limpar filtros
    const clearFilters = () => {
        marketFilter.value = 'all';
        sortFilter.value = 'recent';
        applyFilters();
    };

    // Limpar busca
    const clearSearch = () => {
        searchInput.value = '';
        resultsGrid.innerHTML = '';
        resultsFilters.style.display = 'none';
        searchInput.focus();
    };

    // Eventos
    clearSearchButton.addEventListener('click', clearSearch);
    clearFiltersButton.addEventListener('click', clearFilters);
    
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') performSearch(false);
    });
    
    marketFilter.addEventListener('change', applyFilters);
    sortFilter.addEventListener('change', applyFilters);

    // Carregar informações do usuário
    const loadUserInfo = async () => {
        try {
            const session = await getSession();
            if (session && session.user) {
                const userName = document.getElementById('userName');
                const userAvatar = document.getElementById('userAvatar');
                
                if (userName) userName.textContent = session.user.email || 'Usuário';
                if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.email || 'U')}&background=3b82f6&color=fff`;
            }
        } catch (error) {
            console.error('Erro ao carregar informações do usuário:', error);
        }
    };

    // Inicialização
    loadSupermarkets();
    loadUserInfo();
});
