document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/supermarkets';
    const tableBody = document.querySelector('#marketsTable tbody');
    const saveButton = document.getElementById('saveButton');
    const cancelButton = document.getElementById('cancelButton');
    const formTitle = document.getElementById('formTitle');
    const marketIdInput = document.getElementById('marketId');
    const marketNameInput = document.getElementById('marketName');
    const marketCnpjInput = document.getElementById('marketCnpj');

    const loadMarkets = async () => {
        try {
            // Para carregar a lista não precisamos de token, pois é pública
            const response = await fetch(API_URL + "/public");
            const markets = await response.json();
            tableBody.innerHTML = '';
            markets.forEach(market => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${market.nome}</td>
                    <td>${market.cnpj}</td>
                    <td class="actions">
                        <button class="edit-btn" data-id="${market.id}" data-nome="${market.nome}" data-cnpj="${market.cnpj}">Editar</button>
                        <button class="delete-btn" data-id="${market.id}">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showError("Erro ao carregar", "Não foi possível carregar a lista de mercados.", 5000);
        }
    };

    const resetForm = () => {
        formTitle.textContent = 'Adicionar Novo Mercado';
        marketIdInput.value = '';
        marketNameInput.value = '';
        marketCnpjInput.value = '';
        saveButton.textContent = 'Salvar';
        cancelButton.style.display = 'none';
    };

    const saveMarket = async () => {
        const id = marketIdInput.value;
        const nome = marketNameInput.value.trim();
        const cnpj = marketCnpjInput.value.trim().replace(/\D/g, '');
        if (!nome || !cnpj) {
            showWarning("Campos obrigatórios", "Nome e CNPJ são obrigatórios.", 3000);
            return;
        }

        // <-- AQUI ESTÁ A CORREÇÃO -->
        // 1. Pega a sessão atual para obter o token
        const session = await getSession();
        if (!session) {
            showError("Sessão expirada", "Sua sessão expirou. Por favor, faça login novamente.", 3000);
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 1500);
            return;
        }

        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/${id}` : API_URL;

        try {
            const response = await fetch(url, {
                method: method,
                // 2. Adiciona o cabeçalho de autorização na requisição
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ nome, cnpj })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail);
            }
            
            resetForm();
            loadMarkets();
            showSuccess("Mercado salvo", `Mercado ${nome} foi salvo com sucesso.`, 3000);

        } catch (error) {
            console.error('Erro ao salvar mercado:', error);
            showError("Erro ao salvar", `Não foi possível salvar o mercado: ${error.message}`, 5000);
        }
    };

    tableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('edit-btn')) {
            const id = e.target.dataset.id;
            const nome = e.target.dataset.nome;
            const cnpj = e.target.dataset.cnpj;
            
            formTitle.textContent = 'Editar Mercado';
            marketIdInput.value = id;
            marketNameInput.value = nome;
            marketCnpjInput.value = cnpj;
            saveButton.textContent = 'Atualizar';
            cancelButton.style.display = 'inline-block';
        }
        
        if (e.target.classList.contains('delete-btn')) {
            if (!confirm('Tem certeza que deseja excluir este mercado?')) return;
            
            const id = e.target.dataset.id;

            // <-- CORREÇÃO ADICIONAL PARA DELETAR -->
            const session = await getSession();
            if (!session) {
                showError("Sessão expirada", "Sua sessão expirou. Por favor, faça login novamente.", 3000);
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1500);
                return;
            }

            try {
                const response = await fetch(`${API_URL}/${id}`, { 
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                
                if (response.ok) {
                    loadMarkets();
                    showSuccess("Mercado excluído", "O mercado foi excluído com sucesso.", 3000);
                } else {
                    showError("Erro ao excluir", "Falha ao excluir mercado. Verifique suas permissões.", 5000);
                }
            } catch (error) {
                console.error('Erro ao excluir mercado:', error);
                showError("Erro ao excluir", `Não foi possível excluir o mercado: ${error.message}`, 5000);
            }
        }
    });

    saveButton.addEventListener('click', saveMarket);
    cancelButton.addEventListener('click', resetForm);
    loadMarkets();
});