document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/supermarkets';
    const tableBody = document.querySelector('#marketsTable tbody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    // Função para obter a sessão do usuário
    const getSession = async () => {
        try {
            const { data: { session }, error } = await window.supabase.auth.getSession();
            if (error) throw error;
            return session;
        } catch (error) {
            console.error('Erro ao obter sessão:', error);
            return null;
        }
    };

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
                        <button class="edit-btn" data-id="${market.id}" data-nome="${market.nome}" data-cnpj="${market.cnpj}">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="delete-btn" data-id="${market.id}">
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

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Mercado';
        marketIdInput.value = '';
        marketNameInput.value = '';
        marketCnpjInput.value = '';
        saveButton.textContent = 'Salvar';
        saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
        cancelButton.style.display = 'none';
    };

    const saveMarket = async () => {
        const id = marketIdInput.value;
        const nome = marketNameInput.value.trim();
        const cnpj = marketCnpjInput.value.trim().replace(/\D/g, '');
        
        if (!nome) {
            alert('Nome do mercado é obrigatório.');
            marketNameInput.focus();
            return;
        }
        
        if (!cnpj || cnpj.length !== 14) {
            alert('CNPJ deve conter 14 dígitos.');
            marketCnpjInput.focus();
            return;
        }

        const session = await getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = '/login.html';
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/${id}` : API_URL;

        try {
            saveButton.disabled = true;
            saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

            const response = await fetch(url, {
                method: method,
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ nome, cnpj })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || errorData.message || `Erro ${response.status}`);
            }
            
            alert(id ? 'Mercado atualizado com sucesso!' : 'Mercado cadastrado com sucesso!');
            resetForm();
            await loadMarkets();

        } catch (error) {
            console.error('Erro ao salvar mercado:', error);
            alert(`Erro: ${error.message}`);
        } finally {
            saveButton.disabled = false;
            saveButton.innerHTML = id ? '<i class="fas fa-save"></i> Atualizar' : '<i class="fas fa-save"></i> Salvar';
        }
    };

    // Evento para editar mercado
    tableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('edit-btn') || e.target.closest('.edit-btn')) {
            const button = e.target.classList.contains('edit-btn') ? e.target : e.target.closest('.edit-btn');
            const id = button.dataset.id;
            const nome = button.dataset.nome;
            const cnpj = button.dataset.cnpj;

            formTitle.textContent = 'Editar Mercado';
            marketIdInput.value = id;
            marketNameInput.value = nome;
            marketCnpjInput.value = cnpj;
            saveButton.textContent = 'Atualizar';
            saveButton.innerHTML = '<i class="fas fa-save"></i> Atualizar';
            cancelButton.style.display = 'inline-block';
            
            marketNameInput.focus();
        }
        
        if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
            if (!confirm('Tem certeza que deseja excluir este mercado?\nEsta ação não pode ser desfeita.')) return;
            
            const button = e.target.classList.contains('delete-btn') ? e.target : e.target.closest('.delete-btn');
            const id = button.dataset.id;

            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                return;
            }

            try {
                button.disabled = true;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';

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
                button.disabled = false;
                button.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            }
        }
    });

    // Evento para formatar CNPJ durante a digitação
    marketCnpjInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length > 14) value = value.substring(0, 14);
        
        if (value.length > 11) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        } else if (value.length > 8) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})/, '$1.$2.$3/$4');
        } else if (value.length > 5) {
            value = value.replace(/^(\d{2})(\d{3})(\d{3})/, '$1.$2.$3');
        } else if (value.length > 2) {
            value = value.replace(/^(\d{2})(\d{3})/, '$1.$2');
        }
        
        e.target.value = value;
    });

    saveButton.addEventListener('click', saveMarket);
    cancelButton.addEventListener('click', resetForm);

    // Adicionar ícones aos botões
    saveButton.innerHTML = '<i class="fas fa-save"></i> Salvar';
    cancelButton.innerHTML = '<i class="fas fa-times"></i> Cancelar Edição';

    // Carregar dados iniciais
    loadMarkets();
});
