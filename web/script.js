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
            supermarketFiltersContainer.innerHTML = '<p style="color: red;">Não foi possível carregar os filtros.</p>';
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
            if (isRealtime) {
                // Para busca em tempo real, usa authenticatedFetch
                const response = await authenticatedFetch(`/api/realtime-search`, {
                    method: 'POST',
                    body: JSON.stringify({ produto: query, cnpjs: selectedCnpjs })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || `Erro ${response.status} na API.`);
                }
                
                const data = await response.json();
                displayResults(data.results, query);
            } else {
                // Para busca normal, verifica sessão mas não exige autenticação
                const session = await getSession();
                const headers = { 'Content-Type': 'application/json' };
                if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

                let url = `/api/search?q=${encodeURIComponent(query)}`;
                if (selectedCnpjs.length > 0) url += `&${selectedCnpjs.map(cnpj => `cnpjs=${cnpj}`).join('&')}`;
                
                const response = await fetch(url, { headers });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.detail || `Erro ${response.status} na API.`);
                }
                
                const data = await response.json();
                displayResults(data.results, query);
            }
        } catch (error) {
            console.error(error);
            showMessage(`Erro na busca: ${error.message}`);
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
    });
    searchButton.addEventListener('click', () => performSearch(false));
    realtimeSearchButton.addEventListener('click', () => performSearch(true));
    searchInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') performSearch(false);
    });

    loadSupermarkets();
});
