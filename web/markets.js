document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DA UI ---
    const tableBody = document.getElementById('marketsTableBody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    const API_URL = '/api/supermarkets';

    // --- LÓGICA DE NEGÓCIO ---

    const loadMarkets = async () => {
        try {
            const markets = await authenticatedFetch(API_URL).then(res => res.json());

            tableBody.innerHTML = '';
            if (markets.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="3" class="no-data">Nenhum mercado cadastrado.</td></tr>`;
            }
            markets.forEach(market => {
                const row = document.createElement('tr');
                row.dataset.market = JSON.stringify(market); // Salva os dados no elemento
                row.innerHTML = `
                    <td>${market.nome}</td>
                    <td>${market.cnpj}</td>
                    <td class="actions">
                        <button class="btn-icon edit-btn" title="Editar"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon delete-btn" title="Excluir"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            tableBody.innerHTML = `<tr><td colspan="3" class="no-data error-text">Falha ao carregar mercados.</td></tr>`;
        }
    };

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Mercado';
        marketIdInput.value = '';
        marketNameInput.value = '';
        marketCnpjInput.value = '';
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
        marketNameInput.focus();
    };

    const populateFormForEdit = (market) => {
        formTitle.textContent = `Editando: ${market.nome}`;
        marketIdInput.value = market.id;
        marketNameInput.value = market.nome;
        marketCnpjInput.value = market.cnpj;
        saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
        cancelButton.style.display = 'inline-flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const saveMarket = async () => {
        const id = marketIdInput.value;
        const nome = marketNameInput.value.trim();
        const cnpj = marketCnpjInput.value.trim().replace(/\D/g, '');

        if (!nome || !cnpj) {
            alert('Nome e CNPJ são obrigatórios.');
            return;
        }

        const isUpdating = !!id;
        const url = isUpdating ? `${API_URL}/${id}` : API_URL;
        const method = isUpdating ? 'PUT' : 'POST';
        const body = JSON.stringify({ id: isUpdating ? parseInt(id) : undefined, nome, cnpj });

        saveButton.disabled = true;
        saveButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;

        try {
            const response = await authenticatedFetch(url, { method, body });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Erro ao salvar mercado');
            }
            alert(`Mercado ${isUpdating ? 'atualizado' : 'criado'} com sucesso!`);
            resetForm();
            loadMarkets();
        } catch (error) {
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            resetForm(); // Reseta o texto do botão
        }
    };

    const deleteMarket = async (id, name) => {
        if (!confirm(`Tem certeza que deseja excluir o mercado "${name}"?`)) return;

        try {
            const response = await authenticatedFetch(`${API_URL}/${id}`, { method: 'DELETE' });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Falha ao excluir mercado.');
            }
            alert('Mercado excluído com sucesso!');
            loadMarkets();
        } catch (error) {
            alert(error.message);
        }
    };

    // --- EVENT LISTENERS ---
    
    tableBody.addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-btn');
        const deleteButton = e.target.closest('.delete-btn');
        
        if (editButton) {
            const market = JSON.parse(editButton.closest('tr').dataset.market);
            populateFormForEdit(market);
        }

        if (deleteButton) {
            const market = JSON.parse(deleteButton.closest('tr').dataset.market);
            deleteMarket(market.id, market.nome);
        }
    });
    
    saveButton.addEventListener('click', saveMarket);
    cancelButton.addEventListener('click', resetForm);
    
    // Inicialização da página
    loadMarkets();
});
