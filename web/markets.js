document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/supermarkets';
    const tableBody = document.querySelector('#marketsTable tbody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    // ... resto do código igual até a função loadMarkets ...

    const loadMarkets = async () => {
        try {
            console.log('Carregando mercados...');
            const response = await fetch(API_URL + "/public");
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }
            
            const markets = await response.json();
            console.log('Mercados carregados:', markets);
            
            tableBody.innerHTML = '';
            
            if (markets.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Nenhum mercado cadastrado</td></tr>';
                return;
            }
            
            markets.forEach(market => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${market.nome || 'N/A'}</td>
                    <td>${market.cnpj || 'N/A'}</td>
                    <td class="actions">
                        <button class="btn btn-secondary edit-market" data-id="${market.id}" data-nome="${market.nome}" data-cnpj="${market.cnpj}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="btn danger delete-market" data-id="${market.id}">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: red;">Erro ao carregar dados</td></tr>';
        }
    };

    // ... resto do código igual até o evento de clique ...

    // Evento para editar/excluir mercado - CORRIGIDO
    tableBody.addEventListener('click', async (e) => {
        const editBtn = e.target.closest('.edit-market');
        const deleteBtn = e.target.closest('.delete-market');
        
        if (editBtn) {
            const id = editBtn.dataset.id;
            const nome = editBtn.dataset.nome;
            const cnpj = editBtn.dataset.cnpj;

            formTitle.textContent = 'Editar Mercado';
            marketIdInput.value = id;
            marketNameInput.value = nome;
            marketCnpjInput.value = cnpj;
            saveButton.textContent = 'Atualizar';
            saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
            cancelButton.style.display = 'inline-block';
            
            marketNameInput.focus();
        }
        
        if (deleteBtn) {
            if (!confirm('Tem certeza que deseja excluir este mercado?\nEsta ação não pode ser desfeita.')) return;
            
            const id = deleteBtn.dataset.id;

            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                return;
            }

            try {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';

                const response = await fetch(`${API_URL}/${id}`, { 
                    method: 'DELETE',
                    headers: { 
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    alert('Mercado excluído com sucesso!');
                    await loadMarkets();
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || errorData.message || 'Falha ao excluir mercado');
                }
            } catch (error) {
                console.error('Erro ao excluir mercado:', error);
                alert(`Erro: ${error.message}`);
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
        }
    });

    // ... resto do código igual ...
});
