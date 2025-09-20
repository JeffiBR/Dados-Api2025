document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/collections';
    const tableBody = document.querySelector('#collectionsTable tbody');

    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    const getStatusBadge = (status) => {
        status = status?.toLowerCase() || 'unknown';
        let badgeClass = 'status-unknown';
        let text = status;
        
        if (status.includes('complet') || status.includes('concluíd') || status === 'completed') {
            badgeClass = 'status-completed';
            text = 'Concluída';
        } else if (status.includes('execuçã') || status.includes('running') || status.includes('process')) {
            badgeClass = 'status-running';
            text = 'Em execução';
        } else if (status.includes('falh') || status.includes('error') || status.includes('failed')) {
            badgeClass = 'status-failed';
            text = 'Falha';
        }
        
        return `<span class="status-badge ${badgeClass}">${text}</span>`;
    };

    const loadCollections = async () => {
        toggleLoading(true);
        try {
            const response = await authenticatedFetch(API_URL);
            if (!response.ok) throw new Error('Falha ao carregar coletas.');
            const collections = await response.json();
            
            tableBody.innerHTML = '';
            if (collections.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px;">Nenhuma coleta encontrada.</td></tr>';
                return;
            }
            
            collections.forEach(c => {
                // Adiciona a linha principal da coleta
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>#${c.id}</td>
                    <td>${formatarData(c.iniciada_em)}</td>
                    <td>${getStatusBadge(c.status)}</td>
                    <td>${c.total_registros || 0}</td>
                    <td class="actions">
                        <button class="details-btn" data-id="${c.id}">Ver Detalhes</button>
                        <button class="delete-btn" data-id="${c.id}">Excluir</button>
                    </td>
                `;
                tableBody.appendChild(row);

                // Adiciona a linha de detalhes, inicialmente escondida
                const detailsRow = document.createElement('tr');
                detailsRow.classList.add('details-row');
                detailsRow.id = `details-${c.id}`;
                detailsRow.style.display = 'none';
                detailsRow.innerHTML = `<td colspan="5"><div class="details-content">Carregando detalhes...</div></td>`;
                tableBody.appendChild(detailsRow);
            });
        } catch (error) {
            console.error('Erro ao carregar coletas:', error);
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--error);">${error.message}</td></tr>`;
            showNotification('Erro ao carregar histórico de coletas', 'error');
        } finally {
            toggleLoading(false);
        }
    };

    tableBody.addEventListener('click', async (e) => {
        const target = e.target;

        // Lógica para o botão "Ver Detalhes"
        if (target.classList.contains('details-btn')) {
            const id = target.dataset.id;
            const detailsRow = document.getElementById(`details-${id}`);
            const detailsContent = detailsRow.querySelector('.details-content');

            // Alterna a visibilidade da linha de detalhes
            const isVisible = detailsRow.style.display !== 'none';
            detailsRow.style.display = isVisible ? 'none' : '';
            target.textContent = isVisible ? 'Ver Detalhes' : 'Ocultar Detalhes';

            // Se for a primeira vez que abre, busca os dados na API
            if (!isVisible && detailsContent.innerHTML === 'Carregando detalhes...') {
                 try {
                    const response = await authenticatedFetch(`${API_URL}/${id}/details`);
                    if (!response.ok) throw new Error('Falha ao buscar detalhes.');
                    const details = await response.json();
                    
                    if(details.length === 0) {
                        detailsContent.innerHTML = '<p style="text-align: center; padding: 10px;">Nenhum item foi coletado para esta execução.</p>';
                        return;
                    }

                    let detailsHtml = '<ul>';
                    details.forEach(detail => {
                        detailsHtml += `
                            <li>
                                <span class="market-name">${detail.nome_supermercado}:</span>
                                <span class="items-count">${detail.total_itens} itens</span>
                            </li>`;
                    });
                    detailsHtml += '</ul>';
                    detailsContent.innerHTML = detailsHtml;

                } catch (error) {
                    detailsContent.innerHTML = `<p style="color: var(--error); text-align: center; padding: 10px;">${error.message}</p>`;
                }
            }
        }

        // Lógica para o botão "Excluir"
        if (target.classList.contains('delete-btn')) {
            const id = target.dataset.id;
            
            if (confirm('Tem certeza que deseja excluir esta coleta? Esta ação não pode ser desfeita.')) {
                try {
                    toggleLoading(true);
                    const response = await authenticatedFetch(`${API_URL}/${id}`, {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) throw new Error('Falha ao excluir coleta.');
                    
                    showNotification('Coleta excluída com sucesso!', 'success');
                    
                    // Recarrega a lista de coletas
                    await loadCollections();
                    
                } catch (error) {
                    console.error('Erro ao excluir coleta:', error);
                    showNotification('Erro ao excluir coleta: ' + error.message, 'error');
                } finally {
                    toggleLoading(false);
                }
            }
        }
    });

    // Inicializar a carga de dados
    loadCollections();
});
