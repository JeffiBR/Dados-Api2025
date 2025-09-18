document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#productsTable tbody');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageInfo = document.getElementById('pageInfo');

    let currentPage = 1;
    const pageSize = 50;
    let totalCount = 0;

    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };
    
    const formatarPreco = (preco) => {
        if (typeof preco !== 'number') return 'N/A';
        return `R$ ${preco.toFixed(2).replace('.', ',')}`;
    };

    const fetchLogs = async (page) => {
        try {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">Carregando...</td></tr>`;
            
            // <-- CORREÇÃO: Pega a sessão para obter o token -->
            const session = await getSession();
            if (!session) {
                // Se não há sessão, o routeGuard já deve ter redirecionado.
                // Apenas interrompemos a execução para evitar erros.
                return;
            }
            
            const response = await fetch(`/api/products-log?page=${page}&page_size=${pageSize}`, {
                // <-- CORREÇÃO: Adiciona o cabeçalho de autorização -->
                headers: {
                    'Authorization': `Bearer ${session.access_token}`
                }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Falha ao carregar o log de produtos.');
            }
            
            const result = await response.json();
            const products = result.data;
            totalCount = result.total_count || 0;
            
            tableBody.innerHTML = '';

            if (products.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum produto encontrado.</td></tr>';
            } else {
                products.forEach(product => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${product.nome_produto || 'N/A'}</td>
                        <td>${formatarPreco(product.preco_produto)}</td>
                        <td>${product.nome_supermercado || 'N/A'}</td>
                        <td>${formatarData(product.data_ultima_venda)}</td>
                        <td>${product.codigo_barras || 'N/A'}</td>
                        <td>#${product.coleta_id}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
            
            updatePaginationControls();

        } catch (error) {
            console.error('Erro ao carregar log de produtos:', error);
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;">${error.message}</td></tr>`;
        }
    };

    const updatePaginationControls = () => {
        const totalPages = Math.ceil(totalCount / pageSize);
        pageInfo.textContent = `Página ${currentPage} de ${totalPages > 0 ? totalPages : 1}`;
        
        prevPageBtn.disabled = currentPage <= 1;
        nextPageBtn.disabled = currentPage >= totalPages;
    };

    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogs(currentPage);
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalCount / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            fetchLogs(currentPage);
        }
    });

    // A função routeGuard (em auth.js) garante que o usuário está logado antes de chamar fetchLogs
    fetchLogs(currentPage);
});
