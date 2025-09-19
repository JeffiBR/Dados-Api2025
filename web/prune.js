document.addEventListener('DOMContentLoaded', () => {
    const marketSelect = document.getElementById('marketSelect');
    const collectionsContainer = document.getElementById('collectionsContainer');
    const collectionsCheckboxList = document.getElementById('collectionsCheckboxList');
    const pruneButton = document.getElementById('pruneButton');
    const resultMessage = document.getElementById('resultMessage');

    // Elementos do tema
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const profileButton = document.querySelector('.profile-button');
    const profileDropdown = document.querySelector('.profile-dropdown');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');

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

    const loadSupermarkets = async () => {
        try {
            // Usa o endpoint protegido para admin
            const response = await authenticatedFetch(`/api/supermarkets`);
            if (!response.ok) throw new Error("Não foi possível carregar os supermercados.");
            
            const markets = await response.json();
            
            marketSelect.innerHTML = '<option value="">-- Selecione um supermercado --</option>';
            markets.forEach(market => {
                const option = document.createElement('option');
                option.value = market.cnpj;
                option.textContent = market.nome;
                marketSelect.appendChild(option);
            });
        } catch (error) {
            marketSelect.innerHTML = `<option value="">${error.message}</option>`;
            console.error('Erro:', error);
            
            // Mostrar notificação de erro
            showNotification(`Erro ao carregar supermercados: ${error.message}`, 'error');
        }
    };

    const loadCollectionsForMarket = async (cnpj) => {
        collectionsCheckboxList.innerHTML = '<p>Carregando coletas...</p>';
        collectionsContainer.style.display = 'block';
        pruneButton.disabled = true;

        if (!cnpj) {
            collectionsContainer.style.display = 'none';
            return;
        }

        try {
            const response = await authenticatedFetch(`/api/collections-by-market/${cnpj}`);
            
            // Verifica se a resposta da API foi bem-sucedida (status 200)
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Falha ao buscar coletas do mercado.');
            }

            const collections = await response.json();

            collectionsCheckboxList.innerHTML = '';
            if (collections.length === 0) {
                collectionsCheckboxList.innerHTML = '<p>Nenhuma coleta com produtos encontrados para este mercado.</p>';
                return;
            }

            collections.forEach(collection => {
                const date = new Date(collection.iniciada_em).toLocaleDateString('pt-BR');
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" name="collection" value="${collection.coleta_id}"> 
                                  <i class="fas fa-database"></i> Coleta #${collection.coleta_id} de ${date}`;
                collectionsCheckboxList.appendChild(label);
            });
            pruneButton.disabled = false;

        } catch (error) {
            collectionsCheckboxList.innerHTML = `<p style="color: red;">${error.message}</p>`;
            console.error('Erro ao carregar coletas:', error);
            
            // Mostrar notificação de erro
            showNotification(`Erro ao carregar coletas: ${error.message}`, 'error');
        }
    };

    const performPrune = async () => {
        const selectedCnpj = marketSelect.value;
        const selectedMarketName = marketSelect.options[marketSelect.selectedIndex].text;
        const checkedBoxes = document.querySelectorAll('input[name="collection"]:checked');
        const collection_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

        if (collection_ids.length === 0) {
            showNotification('Por favor, selecione pelo menos uma coleta para apagar.', 'warning');
            return;
        }

        const confirmMessage = `Você tem certeza que deseja apagar os dados do supermercado "${selectedMarketName}" para as ${collection_ids.length} coletas selecionadas?\n\nESTA AÇÃO É PERMANENTE.`;
        if (!confirm(confirmMessage)) return;

        pruneButton.disabled = true;
        pruneButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Apagando...';
        resultMessage.textContent = '';

        try {
            const response = await authenticatedFetch(`/api/prune-by-collections`, {
                method: 'POST',
                body: JSON.stringify({ cnpj: selectedCnpj, collection_ids: collection_ids })
            });
            
            // Verificar se a resposta é 401 (Unauthorized)
            if (response.status === 401) {
                throw new Error("Sessão expirada. Faça login novamente.");
            }
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail);
            
            resultMessage.textContent = `Sucesso! ${data.deleted_count} registros foram apagados. Atualizando lista de coletas...`;
            resultMessage.className = 'result-message success';
            
            showNotification(`${data.deleted_count} registros foram apagados com sucesso!`, 'success');
            
            setTimeout(() => loadCollectionsForMarket(selectedCnpj), 2000);

        } catch (error) {
            resultMessage.textContent = `Erro: ${error.message}`;
            resultMessage.className = 'result-message error';
            
            // Verificar se é um erro de autenticação
            if (error.message.includes("Sessão não encontrada") || 
                error.message.includes("Sessão expirada") ||
                error.message.includes("401")) {
                showNotification("Sua sessão expirou. Por favor, faça login novamente.", 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }
            
            showNotification(`Erro ao apagar dados: ${error.message}`, 'error');
        } finally {
            pruneButton.disabled = false;
            pruneButton.innerHTML = '<i class="fas fa-trash"></i> Deletar Coletas Selecionadas';
        }
    };

    // Função para mostrar notificações
    const showNotification = (message, type = 'success') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : 'exclamation'}-circle"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 5000);
    };

    marketSelect.addEventListener('change', () => {
        loadCollectionsForMarket(marketSelect.value);
    });

    pruneButton.addEventListener('click', performPrune);
    
    // Inicialização
    loadSupermarkets();
    
    // Atualizar a UI do usuário após o carregamento
    if (typeof updateUIVisibility === 'function') {
        setTimeout(updateUIVisibility, 100);
    }
});
