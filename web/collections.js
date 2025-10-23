// collections.js - Versão corrigida usando dados da própria coleta
document.addEventListener('DOMContentLoaded', () => {
    const API_URL = '/api/collections';
    const collectionsGrid = document.querySelector('#collectionsGrid');
    const collectionModal = document.querySelector('#collectionModal');
    const closeModalBtn = document.querySelector('#closeModal');
    const modalCollectionId = document.querySelector('#modalCollectionId');
    const modalTotalMarkets = document.querySelector('#modalTotalMarkets');
    const modalTotalItems = document.querySelector('#modalTotalItems');
    const modalCollectionDate = document.querySelector('#modalCollectionDate');
    const marketsList = document.querySelector('#marketsList');

    // Removemos o marketMap pois agora usamos os dados da própria coleta

    // Formatação de dados (mantida igual)
    const formatarData = (dataISO) => {
        if (!dataISO) return 'N/A';
        try {
            const date = new Date(dataISO);
            if (isNaN(date.getTime())) return 'N/A';
            return date.toLocaleString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return 'N/A';
        }
    };

    const formatarNumero = (numero) => {
        if (!numero || isNaN(numero)) return '0';
        return numero.toLocaleString('pt-BR');
    };

    const getStatusClass = (status) => {
        if (!status) return 'status-processing';
        const statusLower = status.toLowerCase();
        if (statusLower.includes('concluíd') || statusLower.includes('complet') || statusLower.includes('concluida')) {
            return 'status-completed';
        } else if (statusLower.includes('process') || statusLower.includes('execut') || statusLower.includes('running')) {
            return 'status-processing';
        } else if (statusLower.includes('falha') || statusLower.includes('erro') || statusLower.includes('failed')) {
            return 'status-error';
        }
        return 'status-processing';
    };

    // REMOVIDA: função loadSupermarkets pois não é mais necessária

    // Buscar dados de uma coleta específica
    const getCollectionData = async (collectionId) => {
        try {
            const response = await authenticatedFetch(`${API_URL}/${collectionId}/details`);
            if (!response.ok) throw new Error('Falha ao carregar detalhes da coleta');
            return await response.json();
        } catch (error) {
            console.error('Erro ao buscar dados da coleta:', error);
            throw error;
        }
    };

    // Carregar lista de coletas (mantida igual)
    const loadCollections = async () => {
        try {
            console.log('📦 Carregando coletas...');
            const response = await authenticatedFetch(API_URL);
            if (!response.ok) throw new Error('Falha ao carregar coletas');

            const collections = await response.json();
            console.log('✅ Coletas carregadas:', collections.length);

            collectionsGrid.innerHTML = '';

            if (collections.length === 0) {
                collectionsGrid.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-inbox"></i>
                        <p>Nenhuma coleta encontrada</p>
                        <div class="subtext">Não há coletas registradas no sistema</div>
                    </div>
                `;
                return;
            }

            // Ordenar por data mais recente
            collections.sort((a, b) => new Date(b.iniciada_em) - new Date(a.iniciada_em));

            collections.forEach(collection => {
                const dataFormatada = formatarData(collection.iniciada_em);
                const statusClass = getStatusClass(collection.status);
                const diasPesquisa = collection.dias_pesquisa || 3;

                const collectionCard = document.createElement('div');
                collectionCard.className = 'collection-card';
                collectionCard.dataset.id = collection.id;

                collectionCard.innerHTML = `
                    <div class="collection-header">
                        <div>
                            <div class="collection-id">#${collection.id}</div>
                            <div class="collection-date">${dataFormatada}</div>
                            <div class="collection-days">${diasPesquisa} dias de pesquisa</div>
                        </div>
                        <span class="collection-status ${statusClass}">${collection.status || 'Processando'}</span>
                    </div>

                    <div class="collection-summary">
                        <div class="summary-item">
                            <div class="summary-value">${formatarNumero(collection.total_registros || 0)}</div>
                            <div class="summary-label">Itens Coletados</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-value">${diasPesquisa}</div>
                            <div class="summary-label">Dias de Pesquisa</div>
                        </div>
                    </div>

                    <div class="collection-actions">
                        <button class="details-btn" data-id="${collection.id}">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                        <button class="delete-btn" data-id="${collection.id}">
                            <i class="fas fa-trash"></i> Excluir
                        </button>
                    </div>
                `;

                collectionsGrid.appendChild(collectionCard);
            });

        } catch (error) {
            console.error('Erro ao carregar coletas:', error);
            collectionsGrid.innerHTML = `
                <div class="empty-state" style="color: var(--error);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar coletas</p>
                    <div class="subtext">${error.message}</div>
                </div>
            `;
        }
    };

    // --- FUNÇÃO PARA CONSTRUIR CARD DO MERCADO (USANDO DADOS DA PRÓPRIA COLETA) ---
    const buildMarketCard = (detail, currentCollection) => {
        const cnpjMercado = detail.cnpj_supermercado;

        // Usar dados diretamente do detail (que vem da própria coleta)
        const marketName = detail.nome_supermercado || 'Supermercado';
        const address = detail.endereco_supermercado || 'Endereço não disponível';

        const totalItensMercado = detail.total_itens || 0;

        return `
        <div class="market-item">
            <div class="market-header">
                <div>
                    <div class="market-name">${marketName}</div>
                    <div class="market-info">
                        <div class="market-cnpj">
                            <i class="fas fa-fingerprint"></i>
                            <strong>CNPJ:</strong> ${cnpjMercado || 'N/A'}
                        </div>
                        <div class="market-address">
                            <i class="fas fa-map-marker-alt"></i>
                            <strong>Endereço:</strong> ${address}
                        </div>
                    </div>
                </div>
                <span class="market-items">${formatarNumero(totalItensMercado)} itens</span>
            </div>
            <div class="market-details">
                <div class="market-detail">
                    <div class="detail-label">
                        <i class="fas fa-calendar"></i> Data da Coleta
                    </div>
                    <div class="detail-value">${formatarData(detail.data_coleta || currentCollection.iniciada_em)}</div>
                </div>
                <div class="market-detail">
                    <div class="detail-label">
                        <i class="fas fa-chart-bar"></i> Itens Coletados
                    </div>
                    <div class="detail-value">${formatarNumero(totalItensMercado)} produtos</div>
                </div>
                <div class="market-detail">
                    <div class="detail-label">
                        <i class="fas fa-check-circle"></i> Status
                    </div>
                    <div class="detail-value status-value ${totalItensMercado > 0 ? 'status-success' : 'status-warning'}">
                        ${totalItensMercado > 0 ? 'Coleta bem-sucedida' : 'Sem dados coletados'}
                    </div>
                </div>
            </div>
        </div>`;
    };

    // Carregar detalhes da coleta - VERSÃO SIMPLIFICADA
    const loadCollectionDetails = async (collectionId) => {
        try {
            collectionModal.classList.add('active');

            // Mostrar loading
            marketsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Carregando detalhes da coleta...</p>
                    <div class="subtext">Buscando informações dos mercados</div>
                </div>
            `;

            modalCollectionId.textContent = collectionId;

            // Carregar dados da coleta
            const [collectionDetails, collectionsList] = await Promise.all([
                getCollectionData(collectionId),
                authenticatedFetch(API_URL).then(r => r.json())
            ]);

            const currentCollection = collectionsList.find(c => c.id == collectionId);
            if (!currentCollection) {
                throw new Error('Coleta não encontrada');
            }

            console.log('📋 Detalhes da coleta:', collectionDetails);

            // Calcular totais
            const totalMercados = collectionDetails.length;
            const totalItens = collectionDetails.reduce((acc, curr) => acc + (curr.total_itens || 0), 0);

            // Atualizar UI
            modalTotalMarkets.textContent = totalMercados;
            modalTotalItems.textContent = formatarNumero(totalItens);
            modalCollectionDate.textContent = formatarData(currentCollection.iniciada_em);

            // Atualizar lista de mercados
            marketsList.innerHTML = '';

            if (collectionDetails.length === 0) {
                marketsList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-store-slash"></i>
                        <p>Nenhum mercado participou desta coleta</p>
                        <div class="subtext">Não foram encontrados dados de mercados para esta coleta</div>
                    </div>
                `;
                return;
            }

            // Criar seção de mercados
            const marketsSection = document.createElement('div');
            marketsSection.className = 'markets-section';
            marketsSection.innerHTML = `<h4>Mercados Participantes</h4>`;

            const marketsContainer = document.createElement('div');
            marketsContainer.className = 'markets-list';

            // Processar cada mercado - USANDO DADOS DA PRÓPRIA COLETA
            collectionDetails.forEach(detail => {
                const marketItem = document.createElement('div');
                marketItem.innerHTML = buildMarketCard(detail, currentCollection);
                marketsContainer.appendChild(marketItem.firstElementChild);
            });

            marketsSection.appendChild(marketsContainer);
            marketsList.appendChild(marketsSection);

        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            marketsList.innerHTML = `
                <div class="empty-state" style="color: var(--error);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar detalhes da coleta</p>
                    <div class="subtext">${error.message}</div>
                    <button class="btn outline" onclick="location.reload()" style="margin-top: 1rem;">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            `;
        }
    };

    // Excluir coleta (mantida igual)
    const deleteCollection = async (collectionId) => {
        const confirmacao = confirm(`Tem certeza que deseja excluir a coleta #${collectionId}? Esta ação não pode ser desfeita.`);

        if (!confirmacao) return;

        try {
            const response = await authenticatedFetch(`${API_URL}/${collectionId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Falha ao excluir coleta');
            }

            await loadCollections();
            showNotification('Coleta excluída com sucesso!', 'success');
            collectionModal.classList.remove('active');

        } catch (error) {
            console.error('Erro ao excluir coleta:', error);
            showNotification(error.message, 'error');
        }
    };

    // Mostrar notificações (mantida igual)
    const showNotification = (message, type = 'info') => {
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notif => notif.remove());

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle'
        };

        notification.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    };

    // Event listeners (mantida igual)
    const setupEventListeners = () => {
        // Clique na grade de coletas
        collectionsGrid.addEventListener('click', async (e) => {
            const target = e.target;
            const button = target.closest('button');
            const card = target.closest('.collection-card');

            if (card && !button) {
                const id = card.dataset.id;
                await loadCollectionDetails(id);
                return;
            }

            if (!button) return;

            if (button.classList.contains('details-btn')) {
                const id = button.dataset.id;
                await loadCollectionDetails(id);
            }

            if (button.classList.contains('delete-btn')) {
                const id = button.dataset.id;
                await deleteCollection(id);
            }
        });

        // Fechar modal
        closeModalBtn.addEventListener('click', () => {
            collectionModal.classList.remove('active');
        });

        collectionModal.addEventListener('click', (e) => {
            if (e.target === collectionModal) {
                collectionModal.classList.remove('active');
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && collectionModal.classList.contains('active')) {
                collectionModal.classList.remove('active');
            }
        });
    };

    // Debug das APIs (SIMPLIFICADO)
    const debugAPIs = async () => {
        try {
            console.log('=== 🐛 DEBUG DAS APIS ===');

            // Testar apenas a API de coletas
            try {
                const collectionsResponse = await authenticatedFetch(API_URL);
                const collections = await collectionsResponse.json();
                console.log('📦 API Coletas:', collections);
                if (collections.length > 0) {
                    console.log('📝 Estrutura da primeira coleta:', {
                        id: collections[0].id,
                        status: collections[0].status,
                        iniciada_em: collections[0].iniciada_em,
                        todasAsChaves: Object.keys(collections[0])
                    });
                }
            } catch (error) {
                console.log('❌ Erro na API Coletas:', error);
            }

            console.log('=== 🔚 FIM DEBUG ===');
        } catch (error) {
            console.error('Erro no debug:', error);
        }
    };

    // Inicializar aplicação (SIMPLIFICADA)
    const init = async () => {
        try {
            console.log('🚀 Inicializando página de coletas...');

            setupEventListeners();
            await loadCollections();

            // Debug das APIs
            await debugAPIs();

            console.log('✅ Página de coletas inicializada com sucesso');
        } catch (error) {
            console.error('❌ Erro na inicialização:', error);
            showNotification('Erro ao inicializar a página', 'error');
        }
    };

    // Iniciar
    init();
});