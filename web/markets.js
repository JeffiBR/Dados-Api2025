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
            alert('Não foi possível carregar a lista de mercados.');
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
            alert('Nome e CNPJ são obrigatórios.');
            return;
        }

        // <-- AQUI ESTÁ A CORREÇÃO -->
        // 1. Pega a sessão atual para obter o token
        const session = await getSession();
        if (!session) {
            alert("Sua sessão expirou. Por favor, faça login novamente.");
            window.location.href = '/login.html';
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

        } catch (error) {
            console.error('Erro ao salvar mercado:', error);
            alert(`Erro: ${error.message}`);
        }
    };

    tableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('edit-btn')) {
            // ... (código para editar não muda)
        }
        
        if (e.target.classList.contains('delete-btn')) {
            if (!confirm('Tem certeza que deseja excluir este mercado?')) return;
            
            const id = e.target.dataset.id;

            // <-- CORREÇÃO ADICIONAL PARA DELETAR -->
            const session = await getSession();
            if (!session) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                return;
            }

            fetch(`${API_URL}/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            })
            .then(response => {
                if (response.ok) {
                    loadMarkets();
                } else {
                    alert('Falha ao excluir mercado. Verifique suas permissões.');
                }
            });
        }
    });

    saveButton.addEventListener('click', saveMarket);
    cancelButton.addEventListener('click', resetForm);
    loadMarkets();
});
