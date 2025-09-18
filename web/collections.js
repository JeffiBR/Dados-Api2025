document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/collections';
    const tableBody = document.querySelector('#collectionsTable tbody');

    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        return new Date(dataISO).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    const loadCollections = async () => {
        try {
            const response = await authenticatedFetch(API_URL);
            if (!response.ok) throw new Error('Falha ao carregar coletas.');
            const collections = await response.json();
            
            tableBody.innerHTML = '';
            if (collections.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Nenhuma coleta encontrada.</td></tr>';
                return;
            }
            collections.forEach(c => {
                // Adiciona a linha principal da coleta
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>#${c.id}</td>
                    <td>${formatarData(c.iniciada_em)}</td>
                    <td>${c.status || 'N/A'}</td>
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
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">${error.message}</td></tr>`;
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
                        detailsContent.innerHTML = '<p>Nenhum item foi coletado para esta execução.</p>';
                        return;
                    }

                    let detailsHtml = '<ul>';
                    details.forEach(detail => {
                        detailsHtml += `<li><strong>${detail.nome_supermercado}:</strong> ${detail.total_itens} itens coletados</li>`;
                    });
                    detailsHtml += '</ul>';
                    detailsContent.innerHTML = detailsHtml;

                } catch (error) {
                    detailsContent.innerHTML = `<p style="color: red;">${error.message}</p>`;
                }
            }
        }

        // Lógica para o botão "Excluir"
        if (target.classList.contains('delete-btn')) {
            // ... (código para deletar permanece o mesmo da versão anterior)
        }
    });

    loadCollections();
});
