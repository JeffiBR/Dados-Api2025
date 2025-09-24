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

    // Novos elementos para filtros de mercado
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

    // Utilitários
    const showLoader = (show) => loader.style.display = show ? 'flex' : 'none';
    
    const showMessage = (msg, type = 'info') => {
        let icon = 'fas fa-info-circle';
        let color = 'var(--muted-dark)';
        
        if (type === 'error') {
            icon = 'fas fa-exclamation-triangle';
            color = 'var(--error)';
        } else if (type === 'success') {
            icon = 'fas fa-check-circle';
            color = 'var(--success)';
        }
        
        resultsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <i class="${icon}" style="font-size: 3rem; color: ${color}; margin-bottom: 1rem;"></i>
                <h3 style="color: ${color}; margin-bottom: 0.5rem;">${msg}</h3>
                <p style="color: var(--muted-dark);">Tente ajustar os termos da busca ou filtros</p>
            </div>`;
    };

    const showNotification = (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-triangle' : 'info-circle'}"></i>
            ${message}
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    };

    // Atualizar contador de seleção
    const updateSelectionCount = () => {
        const selected = document.querySelectorAll('.market-card.selected').length;
        selectionCount.textContent = `${selected} selecionados`;
        selectionCount.style.display = selected > 0 ? 'inline-block' : 'none';
    };

    // Filtrar mercados na pesquisa
    const filterMarkets = (searchText) => {
        const marketCards = document.querySelectorAll('.market-card');
        let visibleCount = 0;
        
        marketCards.forEach(card => {
            const marketName = card.querySelector('.market-name').textContent.toLowerCase();
            const marketCnpj = card.querySelector('.market-cnpj').textContent.toLowerCase();
            const searchLower = searchText.toLowerCase();
            
            if (marketName.includes(searchLower) || marketCnpj.includes(searchLower)) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        // Mostrar mensagem se nenhum mercado for encontrado
        const emptyMessage = supermarketFiltersContainer.querySelector('.no-markets-message');
        if (visibleCount === 0 && searchText) {
            if (!emptyMessage) {
                const message = document.createElement('div');
                message.className = 'no-markets-message';
                message.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--muted-dark);">
                        <i class="fas fa-search" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                        <p>Nenhum supermercado encontrado para "${searchText}"</p>
                    </div>
                `;
                supermarketFiltersContainer.appendChild(message);
            }
        } else if (emptyMessage) {
            emptyMessage.remove();
        }
    };

    // Renderização de cards de mercado
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
                
                // Efeito de feedback visual
                card.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    card.style.transform = '';
                }, 150);
            }
        });
        
        return card;
    };

    // Renderização eficiente de filtros de mercado
    const buildSupermarketFilters = (markets) => {
        allMarkets = markets;
        const frag = document.createDocumentFragment();
        
        if (markets.length === 0) {
            supermarketFiltersContainer.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--muted-dark);">
                    <i class="fas fa-store-slash" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <p>Nenhum supermercado disponível</p>
                </div>
            `;
            return;
        }
        
        markets.forEach(market => {
            const card = buildMarketCard(market);
            frag.appendChild(card);
        });
        
        supermarketFiltersContainer.innerHTML = '';
        supermarketFiltersContainer.appendChild(frag);
        updateSelectionCount();
    };

    // Selecionar/Deselecionar todos os mercados
    selectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card').forEach(card => {
            if (card.style.display !== 'none') {
                card.classList.add('selected');
                card.querySelector('input').checked = true;
            }
        });
        updateSelectionCount();
        showNotification('Todos os supermercados selecionados', 'success');
    });

    deselectAllMarkets.addEventListener('click', () => {
        document.querySelectorAll('.market-card').forEach(card => {
            card.classList.remove('selected');
            card.querySelector('input').checked = false;
        });
        updateSelectionCount();
        showNotification('Seleção limpa', 'info');
    });

    // Limpar pesquisa de mercados
    clearMarketSearch.addEventListener('click', () => {
        marketSearchInput.value = '';
        filterMarkets('');
        marketSearchInput.focus();
    });

    // Pesquisa em tempo real nos mercados
    let searchTimeout;
    marketSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            filterMarkets(e.target.value);
        }, 300);
    });

    // Renderização de cards de produto (ATUALIZADA)
    const buildProductCard = (item, index, allResults) => {
        const price = typeof item.preco_produto === 'number' ? 
            `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        
        const date = item.data_ultima_venda ? 
            new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        
        // Calcular estatísticas de preço
        const prices = allResults.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        
        // Determinar se é o mais barato ou mais caro
        let priceBadge = '';
        let isCheapest = false;
        if (prices.length > 1 && item.preco_produto === minPrice) {
            priceBadge = '<span class="price-badge cheapest"><i class="fas fa-tag"></i> Mais barato</span>';
            isCheapest = true;
        } else if (prices.length > 1 && item.preco_produto === maxPrice) {
            priceBadge = '<span class="price-badge expensive"><i class="fas fa-exclamation-circle"></i> Mais caro</span>';
        }
        
        // Calcular diferença da média
        let avgIndicator = '';
        if (prices.length > 1 && typeof item.preco_produto === 'number' && avgPrice > 0) {
            const diffFromAvg = ((item.preco_produto - avgPrice) / avgPrice * 100).toFixed(1);
            if (item.preco_produto < avgPrice) {
                avgIndicator = `<span class="avg-indicator below"><i class="fas fa-arrow-down"></i> ${Math.abs(diffFromAvg)}% abaixo da média</span>`;
            } else if (item.preco_produto > avgPrice) {
                avgIndicator = `<span class="avg-indicator above"><i class="fas fa-arrow-up"></i> ${diffFromAvg}% acima da média</span>`;
            }
        }

        return `
        <div class="product-card" data-price="${item.preco_produto || 0}" ${isCheapest ? 'data-cheapest="true"' : ''}>
            <div class="card-header">
                <div class="product-name">${item.nome_produto || 'Produto sem nome'}</div>
                ${priceBadge}
            </div>
            <div class="price-section">
                <div class="product-price">${price}</div>
                ${avgIndicator}
            </div>
            <ul class="product-details">
                <li><span class="detail-icon"></span> 
                    <span class="supermarket-name">${item.nome_supermercado}</span>
                </li>
                <li><span class="detail-icon"></span> 
                    ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})
                </li>
                <li><span class="detail-icon"></span> 
                    <span class="sale-date">Visto em: ${date}</span>
                </li>
                <li><span class="detail-icon"></span> 
                    ${item.codigo_barras || 'Sem código'}
                </li>
            </ul>
            <div class="card-actions">
                <button class="action-btn compare-btn" title="Comparar preço" data-product='${JSON.stringify(item).replace(/'/g, "&#39;")}'>
                    <i class="fas fa-balance-scale"></i>
                </button>
                <button class="action-btn favorite-btn" title="Favoritar" data-product-id="${item.id || index}">
                    <i class="far fa-heart"></i>
                </button>
            </div>
        </div>`;
    };

    // Função para aplicar filtros aos resultados
    const applyFilters = () => {
        if (currentResults.length === 0) return;
        
        let filteredResults = [...currentResults];
        
        // Filtrar por mercado
        const selectedMarket = marketFilter.value;
        if (selectedMarket !== 'all') {
            filteredResults = filteredResults.filter(item => item.cnpj_supermercado === selectedMarket);
        }
        
        // Ordenar resultados
        const sortBy = sortFilter.value;
        switch(sortBy) {
            case 'cheap':
                filteredResults.sort((a, b) => (a.preco_produto || 0) - (b.preco_produto || 0));
                break;
            case 'expensive':
                filteredResults.sort((a, b) => (b.preco_produto || 0) - (a.preco_produto || 0));
                break;
            case 'name':
                filteredResults.sort((a, b) => (a.nome_produto || '').localeCompare(b.nome_produto || ''));
                break;
            case 'recent':
            default:
                filteredResults.sort((a, b) => {
                    const dateA = a.data_ultima_venda ? new Date(a.data_ultima_venda) : new Date(0);
                    const dateB = b.data_ultima_venda ? new Date(b.data_ultima_venda) : new Date(0);
                    return dateB - dateA;
                });
                break;
        }
        
        // Exibir resultados filtrados
        displayFilteredResults(filteredResults);
    };

    // Exibir resultados filtrados
    const displayFilteredResults = (results) => {
        if (results.length === 0) {
            resultsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
                    <h3>Nenhum resultado encontrado</h3>
                    <p>Tente ajustar os filtros aplicados</p>
                </div>`;
            return;
        }
        
        const frag = document.createDocumentFragment();
        
        // Adicionar contador de resultados com estatísticas
        const prices = results.map(r => r.preco_produto).filter(p => typeof p === 'number');
        const minPrice = prices.length ? Math.min(...prices).toFixed(2).replace('.', ',') : '0,00';
        const maxPrice = prices.length ? Math.max(...prices).toFixed(2).replace('.', ',') : '0,00';
        const avgPrice = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2).replace('.', ',') : '0,00';
        
        const resultsCount = document.createElement('div');
        resultsCount.className = 'results-summary';
        resultsCount.innerHTML = `
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
        `;
        frag.appendChild(resultsCount);
        
        // Adicionar cards de produtos
        results.forEach((item, index) => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item, index, results);
            frag.appendChild(div.firstElementChild);
        });
        
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
        
        // Adicionar event listeners aos botões dos cards
        addCardEventListeners();
    };

    // Adicionar event listeners aos botões dos cards
    const addCardEventListeners = () => {
        // Botão de comparar
        document.querySelectorAll('.compare-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productData = JSON.parse(e.target.closest('.compare-btn').dataset.product.replace(/&#39;/g, "'"));
                showNotification(`Produto "${productData.nome_produto}" adicionado à comparação`, 'success');
                // Aqui você pode adicionar a lógica para adicionar à comparação
            });
        });
        
        // Botão de favoritar
        document.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = e.target.closest('.favorite-btn').dataset.productId;
                const icon = e.target.closest('.favorite-btn').querySelector('i');
                
                if (icon.classList.contains('far')) {
                    icon.classList.remove('far');
                    icon.classList.add('fas');
                    icon.style.color = 'var(--error)';
                    showNotification('Produto adicionado aos favoritos', 'success');
                } else {
                    icon.classList.remove('fas');
                    icon.classList.add('far');
                    icon.style.color = '';
                    showNotification('Produto removido dos favoritos', 'info');
                }
            });
        });
        
        // Click no card (expande detalhes)
        document.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.action-btn')) {
                    card.classList.toggle('expanded');
                }
            });
        });
    };

    // Atualizar filtro de mercados com base nos resultados
    const updateMarketFilter = (results) => {
        // Limpar opções existentes (mantendo a opção "Todos")
        while (marketFilter.options.length > 1) {
            marketFilter.remove(1);
        }
        
        // Coletar mercados únicos dos resultados
        const markets = {};
        results.forEach(item => {
            if (item.cnpj_supermercado && item.nome_supermercado) {
                markets[item.cnpj_supermercado] = item.nome_supermercado;
            }
        });
        
        // Adicionar opções ao select
        Object.entries(markets).forEach(([cnpj, nome]) => {
            const option = document.createElement('option');
            option.value = cnpj;
            option.textContent = nome;
            marketFilter.appendChild(option);
        });
    };

    // Carregar supermercados
    const loadSupermarkets = async () => {
        try {
            showLoader(true);
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados.');
            const data = await response.json();
            buildSupermarketFilters(data);
        } catch (error) {
            console.error('Erro ao carregar supermercados:', error);
            supermarketFiltersContainer.innerHTML = `
                <div style="color: var(--error); text-align: center; padding: 2rem;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                    <p>Não foi possível carregar os supermercados.</p>
                    <button class="btn small" onclick="loadSupermarkets()" style="margin-top: 1rem;">
                        <i class="fas fa-redo"></i> Tentar novamente
                    </button>
                </div>`;
        } finally {
            showLoader(false);
        }
    };

    // Nova busca
    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) {
            showMessage('Digite pelo menos 3 caracteres para buscar.', 'info');
            return;
        }
        
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) {
            showMessage('Selecione ao menos um supermercado para busca em tempo real.', 'info');
            return;
        }

        showLoader(true);
        resultsGrid.innerHTML = '';
        resultsFilters.style.display = 'none';

        try {
            let session = null;
            
            if (isRealtime) {
                session = await getSession();
                if (!session) {
                    showMessage('Sua sessão expirou. Faça login novamente.', 'error');
                    setTimeout(() => window.location.href = '/login.html', 1200);
                    return;
                }
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (session) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            let url = '', options = {};
            if (isRealtime) {
                url = `/api/realtime-search`;
                options = { method: 'POST', headers, body: JSON.stringify({ produto: query, cnpjs: selectedCnpjs }) };
            } else {
                url = `/api/search?q=${encodeURIComponent(query)}`;
                if (selectedCnpjs.length > 0) url += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
                options = { method: 'GET', headers };
            }

            const response = await fetch(url, options);
            
            if (response.status === 401) {
                showMessage('Sua sessão expirou. Faça login novamente.', 'error');
                setTimeout(() => window.location.href = '/login.html', 1200);
                return;
            }
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || `Erro ${response.status} na API.`);
            }
            
            const data = await response.json();
            currentResults = data.results || [];
            currentQuery = query;
            
            displayResults(currentResults, query);
            showNotification(`Encontramos ${currentResults.length} resultado(s) para "${query}"`, 'success');

        } catch (error) {
            console.error('Erro na busca:', error);
            showMessage(`Erro na busca: ${error.message}`, 'error');
            showNotification('Erro ao realizar a busca', 'error');
        } finally {
            showLoader(false);
        }
    };

    // Exibir resultados
    const displayResults = (results, query) => {
        if (!results || results.length === 0) {
            showMessage(`Nenhum resultado encontrado para "${query}".`, 'info');
            resultsFilters.style.display = 'none';
            return;
        }
        
        resultsFilters.style.display = 'block';
        updateMarketFilter(results);
        applyFilters();
    };

    // Limpar filtros
    const clearFilters = () => {
        marketFilter.value = 'all';
        sortFilter.value = 'recent';
        applyFilters();
        showNotification('Filtros limpos', 'info');
    };

    // Limpar busca
    const clearSearch = () => {
        searchInput.value = '';
        resultsGrid.innerHTML = '';
        resultsFilters.style.display = 'none';
        searchInput.focus();
        showNotification('Busca limpa', 'info');
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
                const userName = document.querySelector('.user-name');
                const userRole = document.querySelector('.user-role');
                const userAvatar = document.getElementById('userAvatar');
                
                if (userName) userName.textContent = session.user.email || 'Usuário';
                if (userRole) userRole.textContent = session.user.role || 'Usuário';
                if (userAvatar) {
                    userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.email || 'U')}&background=4f46e5&color=fff&bold=true`;
                }
            }
        } catch (error) {
            console.error('Erro ao carregar informações do usuário:', error);
        }
    };

    // Detectar mudanças no tema para atualizar ícones
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                // Atualizar ícones baseados no tema
                const isLightMode = document.body.classList.contains('light-mode');
                // Aqui você pode adicionar lógica para ajustar ícones baseados no tema
            }
        });
    });
    observer.observe(document.body, { attributes: true });

    // Inicialização
    loadSupermarkets();
    loadUserInfo();

    // Focar no campo de busca ao carregar a página
    setTimeout(() => {
        searchInput.focus();
    }, 500);
});

// Função global para recarregar supermercados (usada no error handling)
window.loadSupermarkets = () => {
    const event = new Event('DOMContentLoaded');
    document.dispatchEvent(event);
};
