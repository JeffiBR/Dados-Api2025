document.addEventListener('DOMContentLoaded', () => {
    const marketSelect = document.getElementById('marketSelect');
    const collectionsContainer = document.getElementById('collectionsContainer');
    const collectionsCheckboxList = document.getElementById('collectionsCheckboxList');
    const pruneButton = document.getElementById('pruneButton');
    const resultMessage = document.getElementById('resultMessage');

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
            
            // <-- AQUI ESTÁ A CORREÇÃO PRINCIPAL -->
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
                label.innerHTML = `<input type="checkbox" name="collection" value="${collection.coleta_id}"> Coleta #${collection.coleta_id} de ${date}`;
                collectionsCheckboxList.appendChild(label);
            });
            pruneButton.disabled = false;

        } catch (error) {
            collectionsCheckboxList.innerHTML = `<p style="color: red;">${error.message}</p>`;
            console.error('Erro ao carregar coletas:', error);
        }
    };

    const performPrune = async () => {
        const selectedCnpj = marketSelect.value;
        const selectedMarketName = marketSelect.options[marketSelect.selectedIndex].text;
        const checkedBoxes = document.querySelectorAll('input[name="collection"]:checked');
        const collection_ids = Array.from(checkedBoxes).map(cb => parseInt(cb.value));

        if (collection_ids.length === 0) {
            alert('Por favor, selecione pelo menos uma coleta para apagar.');
            return;
        }

        const confirmMessage = `Você tem certeza que deseja apagar os dados do supermercado "${selectedMarketName}" para as ${collection_ids.length} coletas selecionadas?\n\nESTA AÇÃO É PERMANENTE.`;
        if (!confirm(confirmMessage)) return;

        pruneButton.disabled = true;
        pruneButton.textContent = 'Apagando...';
        resultMessage.textContent = '';

        try {
            const response = await authenticatedFetch(`/api/prune-by-collections`, {
                method: 'POST',
                body: JSON.stringify({ cnpj: selectedCnpj, collection_ids: collection_ids })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail);
            
            resultMessage.textContent = `Sucesso! ${data.deleted_count} registros foram apagados. Atualizando lista de coletas...`;
            resultMessage.style.color = 'green';
            setTimeout(() => loadCollectionsForMarket(selectedCnpj), 2000);

        } catch (error) {
            resultMessage.textContent = `Erro: ${error.message}`;
            resultMessage.style.color = 'red';
        } finally {
            pruneButton.disabled = false;
            pruneButton.textContent = 'Deletar Coletas Selecionadas';
        }
    };

    marketSelect.addEventListener('change', () => {
        loadCollectionsForMarket(marketSelect.value);
    });

    pruneButton.addEventListener('click', performPrune);
    
    loadSupermarkets();
});
