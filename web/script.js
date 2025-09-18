document.addEventListener('DOMContentLoaded', () => {
    // Elementos
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const realtimeSearchButton = document.getElementById('realtimeSearchButton');
    const clearButton = document.getElementById('clearButton');
    const resultsGrid = document.getElementById('resultsGrid');
    const loader = document.getElementById('loader');
    const supermarketFiltersContainer = document.getElementById('supermarketFilters');

    // Utilitários
    const showLoader = (show) => loader.style.display = show ? 'block' : 'none';
    const showMessage = (msg, color = 'red') => {
        resultsGrid.innerHTML = `<p style="color:${color};text-align:center;">${msg}</p>`;
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
                <li><span>🛒</span> ${item.nome_supermercado}</li>
                <li><span>⚖️</span> ${item.tipo_unidade || 'UN'} (${item.unidade_medida || 'N/A'})</li>
                <li><span>📅</span> Visto em: ${date}</li>
                <li><span>🔳</span> ${item.codigo_barras || 'Sem código'}</li>
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
            showError("Erro ao carregar mercados", "Não foi possível carregar os filtros de mercados.", 5000);
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
        }
    };

    // Nova busca: limpa resultados antes
    const performSearch = async (isRealtime = false) => {
        const query = searchInput.value.trim();
        if (query.length < 3) {
            showWarning("Busca muito curta", "Digite pelo menos 3 caracteres para realizar a busca.", 3000);
            return;
        }
        const selectedCnpjs = Array.from(document.querySelectorAll('input[name="supermarket"]:checked')).map(cb => cb.value);
        if (isRealtime && selectedCnpjs.length === 0) {
            showWarning("Nenhum mercado selecionado", "Selecione ao menos um supermercado para busca em tempo real.", 5000);
            return;
        }

        showLoader(true);
        resultsGrid.innerHTML = ''; // Limpa resultados anteriores

        try {
            const session = await getSession();
            if (isRealtime && !session) {
                showError("Sessão expirada", "Sua sessão expirou. Faça login novamente.", 3000);
                setTimeout(() => window.location.href = '/login.html', 1200);
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
                const err = await response.json();
                throw new Error(err.detail || `Erro ${response.status} na API.`);
            }
            const data = await response.json();
            displayResults(data.results, query);

            // Mostra notificação de sucesso na busca
            if (data.results && data.results.length > 0) {
                showSuccess("Busca concluída", `Encontramos ${data.results.length} resultados para "${query}".`, 3000);
            } else {
                showInfo("Nenhum resultado", `Nenhum resultado encontrado para "${query}".`, 3000);
            }

        } catch (error) {
            console.error(error);
            showError("Erro na busca", `Erro ao realizar a busca: ${error.message}`, 5000);
        } finally {
            showLoader(false);
        }
    };

    // Exibir resultados
    const displayResults = (results, query) => {
        if (!results || results.length === 0) return showMessage(`Nenhum resultado para "${query}".`, 'gray');
        const frag = document.createDocumentFragment();
        const header = document.createElement('h3');
        header.textContent = `Resultados para "${query}"`;
        header.style.cssText = 'grid-column: 1 / -1; margin-top: 1rem; border-bottom: 1px solid var(--input-border); padding-bottom: 0.5rem;';
        frag.appendChild(header);
        results.forEach(item => {
            const div = document.createElement('div');
            div.innerHTML = buildProductCard(item);
            frag.appendChild(div.firstElementChild);
        });
        resultsGrid.innerHTML = '';
        resultsGrid.appendChild(frag);
    };

    // Eventos
    clearButton.addEventListener('click', () => {
        resultsGrid.innerHTML = '';
        searchInput.value = '';
        searchInput.focus();
        showInfo("Busca limpa", "Os resultados da busca foram limpos.", 2000);
    });
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') performSearch(false);
    });

    loadSupermarkets();
});