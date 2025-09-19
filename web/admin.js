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
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const profileButton = document.querySelector('.profile-button');
    const profileDropdown = document.querySelector('.profile-dropdown');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');

    // Variáveis para armazenar estado
    let currentResults = [];
    let currentQuery = '';

    // Função para obter a sessão do usuário
    const getSession = async () => {
        try {
            // Verificar se há um token no localStorage
            const token = localStorage.getItem('supabase.auth.token');
            if (!token) return null;
            
            // Verificar se o token é válido (não expirado)
            const tokenData = JSON.parse(token);
            if (!tokenData || !tokenData.access_token) return null;
            
            // Verificar expiração do token
            const currentTime = Math.floor(Date.now() / 1000);
            if (tokenData.expires_at && tokenData.expires_at < currentTime) {
                // Token expirado
                localStorage.removeItem('supabase.auth.token');
                return null;
            }
            
            return tokenData;
        } catch (error) {
            console.error('Erro ao obter sessão:', error);
            return null;
        }
    };

    // Toggle do tema
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

    // Toggle do menu mobile
    mobileMenuButton.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('show');
    });

    // Fechar menu ao clicar no overlay
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    });

    // Toggle do dropdown do perfil
    profileButton.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
    });

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (!profileButton.contains(e.target) && !profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('show');
        }
    });

    // Utilitários
    const showLoader = (show) => loader.style.display = show ? 'flex' : 'none';
    
    const showMessage = (msg, color = 'red') => {
        resultsGrid.innerHTML = `
            <div class="empty-state">
                <h3>${msg}</h3>
                <p>Tente ajustar os termos da busca ou filtros</p>
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

    // Renderização eficiente de filtros
    const buildSupermarketFilters = (markets) => {
        const frag = document.createDocumentFragment();
        markets.forEach(market => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="supermarket" value="${market.cnpj}"> ${market.nome}`;
            frag.appendChild(label);
        });
        supermarketFiltersContainer.innerHTML = '';
        supermarketFiltersContainer.appendChild(frag);
    };

    // Renderização de cards de produto
    const buildProductCard = (item) => {
        const price = typeof item.preco_produto === 'number' ? 
            `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        
        const date = item.data_ultima_venda ? 
            new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        
        return `
        <div class="product-card">
            <div class="card-header">
                <div class="product-name">${item.nome_produto || 'Produto sem nome'}</div>
                <div class="product-price">${price}</div>
            </div>
            <ul class="product-details">
                <li><span>🛒</span> ${item.nome_supermercado}</li>
                <li><span>⚖️</span> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li>
                <li><span>📅</span> Visto em: ${date}</li>
                <li><span>🔳</span> ${item.codigo_barras || 'Sem código'}</li>
            </ul>
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
                <div class="empty-state">
                    <h3>Nenhum resultado encontrado</h3>
                    <p>Tente ajustar os filtros aplicados</p>
                </div>`;
            return;
        }
        
        const frag = document.createDocumentFragment();
        
        // Adicionar contador de resultados
        const resultsCount = document.createElement('div');
        resultsCount.style.cssText = 'grid-column: 1 / -1; margin-bottom: 1rem;';
        resultsCount.innerHTML = `<p><strong>${results.length}</strong> resultado(s) encontrado(s)</p>`;
        frag.appendChild(resultsCount);
        
        // Adicionar cards de produtos
        results.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item);
            frag.appendChild(div.firstElementChild);
        });
        
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
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

    // Supermercados
    const loadSupermarkets = async () => {
        try {
            const response = await fetch(`/api/supermarkets/public`);
            if (!response.ok) throw new Error('Falha ao carregar mercados.');
            const data = await response.json();
            buildSupermarketFilters(data);
        } catch (error) {
            console.error(error);
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
        }
    };

    // Nova busca: limpa resultados antes
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
        resultsGrid.innerHTML = ''; // Limpa resultados anteriores
        resultsFilters.style.display = 'none'; // Esconde filtros

        try {
            let session = null;
            
            // Verificar sessão apenas para busca em tempo real
            if (isRealtime) {
                session = await getSession();
                if (!session) {
                    showMessage('Sua sessão expirou. Faça login novamente.');
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
            
            // Verificar se a resposta é 401 (Unauthorized)
            if (response.status === 401) {
                showMessage('Sua sessão expirou. Faça login novamente.');
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
            showNotification(`Encontramos ${currentResults.length} resultado(s) para "${query}"`);

        } catch (error) {
            console.error(error);
            showMessage(`Erro na busca: ${error.message}`);
            showNotification('Erro ao realizar a busca', 'error');
        } finally {
            showLoader(false);
        }
    };

    // Exibir resultados
    const displayResults = (results, query) => {
        if (!results || results.length === 0) {
            showMessage(`Nenhum resultado para "${query}".`, 'gray');
            resultsFilters.style.display = 'none';
            return;
        }
        
        // Mostrar a área de filtros
        resultsFilters.style.display = 'block';
        
        // Atualizar o filtro de mercados com base nos resultados
        updateMarketFilter(results);
        
        // Aplicar filtros iniciais
        applyFilters();
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
    
    // Eventos para os filtros
    marketFilter.addEventListener('change', applyFilters);
    sortFilter.addEventListener('change', applyFilters);

    // Inicialização
    loadSupermarkets();
});
