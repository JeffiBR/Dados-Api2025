document.addEventListener('DOMContentLoaded', () => {
    // Elementos
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const realtimeSearchButton = document.getElementById('realtimeSearchButton');
    const clearButton = document.getElementById('clearButton');
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');
    const clearSearchButton = document.querySelector('.clear-search');

    // Utilitários
    const showLoader = (show) => loader.style.display = show ? 'flex' : 'none';
    const showMessage = (msg, color = 'red') => {
        resultsGrid.innerHTML = `<div class="empty-state">
            <h3>Nenhum resultado encontrado</h3>
            <p>${msg}</p>
        </div>`;
    };

    // Renderização eficiente de filtros
    const buildSupermarketFilters = (markets) => {
        const frag = document.createDocumentFragment();
        markets.forEach(market => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="supermarket" value="${market.cnpj}">${market.nome}`;
            frag.appendChild(label);
        });
        supermarketFiltersContainer.innerHTML = '';
        supermarketFiltersContainer.appendChild(frag);
    };

    // Renderização de cards de produto
    const buildProductCard = (item) => {
        const price = typeof item.preco_produto === 'number' ? `R$ ${item.preco_produto.toFixed(2).replace('.', ',')}` : 'N/A';
        const date = item.data_ultima_venda ? new Date(item.data_ultima_venda).toLocaleDateString('pt-BR') : 'N/A';
        return `
        <div class="product-card">
            <div class="card-header">
                <div class="product-name">${item.nome_produto || 'Produto sem nome'}</div>
                <div class="product-price">${price}</div>
            </div>
            <ul class="product-details">
                <li><i class="fas fa-store"></i> ${item.nome_supermercado}</li>
                <li><i class="fas fa-balance-scale"></i> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li>
                <li><i class="fas fa-calendar-alt"></i> Visto em: ${date}</li>
                <li><i class="fas fa-barcode"></i> ${item.codigo_barras || 'Sem código'}</li>
            </ul>
        </div>`;
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

    // Verificar e renovar token se necessário
    const checkAndRefreshToken = async () => {
        try {
            const session = await getSession();
            if (!session) {
                return null;
            }

            // Verifica se o token expirou ou está prestes a expirar (em menos de 5 minutos)
            const currentTime = Math.floor(Date.now() / 1000);
            if (session.expires_at && session.expires_at - currentTime < 300) {
                // Tentar renovar o token
                try {
                    const { data, error } = await supabase.auth.refreshSession();
                    if (error) throw error;
                    return data.session;
                } catch (refreshError) {
                    console.error("Erro ao renovar token:", refreshError);
                    return null;
                }
            }
            
            return session;
        } catch (error) {
            console.error("Erro ao verificar token:", error);
            return null;
        }
    };

    // Nova busca: limpa resultados antes
    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) return showMessage('Digite pelo menos 3 caracteres.');
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) return showMessage('Selecione ao menos um supermercado para busca em tempo real.');

        showLoader(true);
        resultsGrid.innerHTML = ''; // Limpa resultados anteriores

        try {
            // Verifica e renova o token se necessário (especialmente para busca em tempo real)
            const session = isRealtime ? await checkAndRefreshToken() : await getSession();
            
            if (isRealtime && !session) {
                showMessage('Sua sessão expirou. Faça login novamente.');
                showNotification("Sua sessão expirou. Redirecionando para login...", "error");
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }
            
            const headers = { 'Content-Type': 'application/json' };
            if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

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
            if (!response.ok) {
                // Se for erro de autenticação, redirecionar para login
                if (response.status === 401) {
                    showNotification("Sua sessão expirou. Faça login novamente.", "error");
                    setTimeout(() => window.location.href = '/login.html', 2000);
                    return;
                }
                
                const err = await response.json();
                throw new Error(err.detail || `Erro ${response.status} na API.`);
            }
            
            const data = await response.json();
            displayResults(data.results, query);
            showNotification(isRealtime ? "Busca em tempo real realizada com sucesso!" : "Busca no histórico realizada com sucesso!", "success");

        } catch (error) {
            console.error(error);
            showMessage(`Erro na busca: ${error.message}`);
            showNotification(`Erro na busca: ${error.message}`, "error");
        } finally {
            showLoader(false);
        }
    };

    // Exibir resultados
    const displayResults = (results, query) => {
        if (!results || results.length === 0) {
            showMessage(`Nenhum resultado encontrado para "${query}".`);
            return;
        }
        
        const frag = document.createDocumentFragment();
        results.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item);
            frag.appendChild(div.firstElementChild);
        });
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
    };

    // Mostrar notificação
    const showNotification = (message, type = "info") => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <span>${message}</span>
            <button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(notification);
        
        // Mostrar notificação
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remover automaticamente após 5 segundos
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentElement) notification.remove();
            }, 300);
        }, 5000);
    };

    // Eventos
    clearButton.addEventListener('click', () => {
        resultsGrid.innerHTML = '';
        searchInput.value = '';
        searchInput.focus();
    });
    
    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
    });
    
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') performSearch(false);
    });

    // Inicialização
    loadSupermarkets();
    
    // Configurar tema
    const themeToggle = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
    
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        if (document.body.classList.contains('light-mode')) {
            localStorage.setItem('theme', 'light');
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else {
            localStorage.setItem('theme', 'dark');
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    });
    
    // Menu mobile
    const mobileMenuButtons = document.querySelectorAll('.mobile-menu-button');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');
    
    mobileMenuButtons.forEach(button => {
        button.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
        });
    });
    
    sidebarOverlay.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('open');
        sidebarOverlay.classList.remove('show');
    });
    
    // Menu de perfil
    const profileMenu = document.getElementById('userProfileMenu');
    if (profileMenu) {
        profileMenu.addEventListener('click', (e) => {
            e.currentTarget.querySelector('.profile-dropdown').classList.toggle('show');
        });
    }
});
