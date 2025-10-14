document.addEventListener('DOMContentLoaded', async () => {
    // ========== DECLARAÇÃO DE VARIÁVEIS ==========
    
    // Elementos principais
    const startButton = document.getElementById('startButton');
    const progressContainer = document.getElementById('progress-container');
    const reportContainer = document.getElementById('report-container');
    
    // Elementos de progresso
    const progressBar = document.getElementById('progressBar');
    const progressPercentText = document.getElementById('progressPercentText');
    const etaText = document.getElementById('etaText');
    const progressText = document.getElementById('progressText');
    const itemsFoundText = document.getElementById('itemsFoundText');
    
    // Elementos de detalhes
    const currentMarketElement = document.getElementById('currentMarket');
    const currentProductElement = document.getElementById('currentProduct');
    const marketsProcessedElement = document.getElementById('marketsProcessed');
    const totalMarketsElement = document.getElementById('totalMarkets');
    const productsInMarketElement = document.getElementById('productsInMarket');
    const totalProductsElement = document.getElementById('totalProducts');
    const itemsInMarketElement = document.getElementById('itemsInMarket');
    const totalItemsElement = document.getElementById('totalItems');
    const elapsedTimeElement = document.getElementById('elapsedTime');
    
    // Elementos de configuração
    const marketsContainer = document.getElementById('marketsContainer');
    const daysContainer = document.getElementById('daysContainer');
    const selectedMarketsCount = document.getElementById('selectedMarketsCount');
    
    // Elementos do relatório
    const reportTotalItems = document.getElementById('report-total-items');
    const reportDuration = document.getElementById('report-duration');
    const reportTableBody = document.querySelector('#reportTable tbody');
    
    // Elementos de UI
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdown = document.getElementById('userDropdown');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const logoutBtn = document.getElementById('logoutBtn');

    let pollingInterval;
    let collectionStartTime;

    // ========== FUNÇÕES UTILITÁRIAS ==========

    // Função para mostrar notificações
    const showNotification = (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 
                    type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
        notification.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, type === 'success' ? 3000 : 5000);
    };

    // Formatar segundos para tempo legível
    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        
        const hours = Math.floor(secs / 3600);
        const minutes = Math.floor((secs % 3600) / 60);
        const seconds = secs % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    };

    // Mensagem quando não há mercados
    function renderNoMarkets() {
        marketsContainer.innerHTML = `
            <div class="no-markets-message">
                <i class="fas fa-store-slash"></i>
                <p>Nenhum mercado cadastrado</p>
                <small>Vá para "Gerenciar Mercados" para adicionar supermercados</small>
            </div>
        `;
        selectedMarketsCount.textContent = '0 mercados selecionados';
    }

    // Renderizar lista de mercados
    function renderMarkets(markets) {
        marketsContainer.innerHTML = '';
        
        markets.forEach(market => {
            const marketElement = document.createElement('div');
            marketElement.className = 'market-checkbox';
            marketElement.innerHTML = `
                <input type="checkbox" id="market-${market.cnpj}" value="${market.cnpj}" checked>
                <label for="market-${market.cnpj}">
                    <span class="market-name">${market.nome}</span>
                    <span class="market-cnpj">${market.cnpj}</span>
                </label>
            `;
            marketsContainer.appendChild(marketElement);
        });

        // Adicionar event listeners para os checkboxes
        marketsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectedMarketsCount);
        });
        
        console.log(`${markets.length} mercados renderizados`);
    }

    // Configurar seleção de dias
    function setupDaysSelection() {
        const days = [1, 2, 3, 4, 5, 6, 7];
        daysContainer.innerHTML = '';
        
        days.forEach(day => {
            const dayElement = document.createElement('div');
            dayElement.className = 'day-option';
            dayElement.innerHTML = `
                <input type="radio" id="day-${day}" name="days" value="${day}" ${day === 3 ? 'checked' : ''}>
                <label for="day-${day}">${day} ${day === 1 ? 'dia' : 'dias'}</label>
            `;
            daysContainer.appendChild(dayElement);
        });
    }

    // Atualizar contador de mercados selecionados
    function updateSelectedMarketsCount() {
        const selectedMarkets = getSelectedMarkets();
        selectedMarketsCount.textContent = `${selectedMarkets.length} mercados selecionados`;
    }

    // Obter mercados selecionados
    function getSelectedMarkets() {
        const checkboxes = marketsContainer.querySelectorAll('input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    // Obter dias selecionados
    function getSelectedDays() {
        const selectedDay = daysContainer.querySelector('input[name="days"]:checked');
        return parseInt(selectedDay.value);
    }

    // ========== FUNÇÕES DE UI ==========

    function toggleTheme() {
        document.body.classList.toggle('light-mode');
        const icon = themeToggle.querySelector('i');
        if (document.body.classList.contains('light-mode')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    function toggleMobileMenu() {
        sidebar.classList.toggle('active');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('show');
    }

    function closeMobileMenu() {
        sidebar.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('show');
    }

    function toggleUserDropdown(e) {
        e.stopPropagation();
        userDropdown.classList.toggle('show');
    }

    function closeUserDropdown(e) {
        if (userDropdown && userMenuBtn && 
            !userMenuBtn.contains(e.target) && 
            !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    }

    function handleLogout(e) {
        e.preventDefault();
        if (typeof window.signOut === 'function') {
            window.signOut();
        } else {
            localStorage.removeItem('supabase.auth.token');
            window.location.href = '/login.html';
        }
    }

    // ========== FUNÇÕES DE PROGRESSO E RELATÓRIO ==========

    // Mostrar relatório
    function showReport(report) {
        reportContainer.style.display = 'block';
        reportTotalItems.textContent = report.totalItemsSaved || 0;
        reportDuration.textContent = formatSeconds(report.totalDurationSeconds);
        
        // Limpar e preencher tabela
        reportTableBody.innerHTML = '';
        if (report.marketBreakdown && report.marketBreakdown.length > 0) {
            report.marketBreakdown.forEach(market => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${market.marketName}</td>
                    <td>${market.itemsFound}</td>
                    <td>${formatSeconds(market.duration)}</td>
                `;
                reportTableBody.appendChild(row);
            });
        }
    }

    // ========== FUNÇÕES PRINCIPAIS ATUALIZADAS ==========

    // Iniciar coleta - FUNÇÃO CORRIGIDA
    const startCollection = async () => {
        const selectedMarkets = getSelectedMarkets();
        const selectedDays = getSelectedDays();
        
        if (selectedMarkets.length === 0) {
            showNotification('Selecione pelo menos um mercado para coletar', 'error');
            return;
        }

        if (!confirm(`Iniciar coleta em ${selectedMarkets.length} mercados com ${selectedDays} dias de pesquisa?`)) {
            return;
        }

        // Esconder relatório anterior
        reportContainer.style.display = 'none';
        collectionStartTime = Date.now();
        
        try {
            // CORREÇÃO: Usar os nomes de campos que a API espera
            const response = await window.authenticatedFetch('/api/trigger-collection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    selected_markets: selectedMarkets, // CORREÇÃO: campo correto
                    dias_pesquisa: selectedDays // CORREÇÃO: campo correto
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Erro ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            showNotification(data.message || 'Coleta iniciada com sucesso!', 'success');
            
            // Iniciar polling imediatamente
            setTimeout(checkStatus, 1000);
            
        } catch (error) {
            console.error('Erro ao iniciar coleta:', error);
            showNotification(`Falha ao iniciar a coleta: ${error.message}`, 'error');
            // Verificar status mesmo em caso de erro para ver se há uma coleta em andamento
            setTimeout(checkStatus, 1000);
        }
    };

    // Verificar status da coleta - FUNÇÃO MELHORADA
    const checkStatus = async () => {
        try {
            const response = await window.authenticatedFetch('/api/collection-status');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            updateUI(data);
            
            // Continuar polling se ainda estiver rodando
            if (data.status === 'RUNNING' && !pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
            }
            
        } catch (error) {
            console.error('Erro ao verificar status:', error);
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            showNotification(`Erro ao verificar status: ${error.message}`, 'error');
        }
    };

    // Carregar lista de mercados - FUNÇÃO MELHORADA
    async function loadMarkets() {
        try {
            console.log('Carregando mercados...');
            
            const response = await window.authenticatedFetch('/api/supermarkets');
            
            if (!response.ok) {
                if (response.status === 401) {
                    showNotification('Sessão expirada. Faça login novamente.', 'error');
                    setTimeout(() => {
                        window.location.href = '/login.html';
                    }, 2000);
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const markets = await response.json();
            console.log('Mercados recebidos:', markets);
            
            if (!markets || markets.length === 0) {
                renderNoMarkets();
                showNotification('Nenhum mercado cadastrado. Adicione mercados primeiro.', 'warning');
                return;
            }
            
            renderMarkets(markets);
            updateSelectedMarketsCount();
            
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showNotification(`Erro ao carregar mercados: ${error.message}`, 'error');
            renderNoMarkets();
        }
    }

    // Atualizar interface com dados de status - FUNÇÃO MELHORADA
    const updateUI = (data) => {
        console.log('Status da coleta:', data);
        
        if (data.status === 'RUNNING') {
            showProgressView(data);
        } else if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            showIdleView(data);
            // Mostrar relatório se disponível
            if (data.report) {
                showReport(data.report);
            }
        } else {
            // Status IDLE ou outro
            showIdleView(data);
        }
    };

    // Mostrar view de progresso - FUNÇÃO MELHORADA
    function showProgressView(data) {
        startButton.disabled = true;
        startButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Coleta em Andamento...';
        progressContainer.style.display = 'block';
        reportContainer.style.display = 'none';

        // Atualizar barra de progresso principal
        const percent = Math.round(data.progressPercent || 0);
        progressBar.style.width = `${percent}%`;
        progressPercentText.textContent = `${percent}%`;
        
        // Atualizar informações de tempo
        etaText.textContent = `Tempo Restante: ${formatSeconds(data.etaSeconds)}`;
        
        // Atualizar informações detalhadas
        currentMarketElement.textContent = data.currentMarket || 'Nenhum';
        currentProductElement.textContent = data.currentProduct || 'Nenhum';
        marketsProcessedElement.textContent = data.marketsProcessed || 0;
        totalMarketsElement.textContent = data.totalMarkets || 0;
        productsInMarketElement.textContent = data.productsProcessedInMarket || 0;
        totalProductsElement.textContent = data.totalProducts || 0;
        itemsInMarketElement.textContent = data.itemsInCurrentMarket || 0;
        totalItemsElement.textContent = data.totalItemsFound || 0;
        
        // Calcular tempo decorrido
        if (collectionStartTime) {
            const elapsed = Math.round((Date.now() - collectionStartTime) / 1000);
            elapsedTimeElement.textContent = formatSeconds(elapsed);
        }

        progressText.textContent = data.progresso || 'Processando...';
        itemsFoundText.textContent = data.totalItemsFound || 0;

        // Iniciar polling se não estiver ativo
        if (!pollingInterval) {
            pollingInterval = setInterval(checkStatus, 3000);
        }
    }

    // Mostrar view de idle/completo - FUNÇÃO MELHORADA
    function showIdleView(data) {
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Coleta Manual';
        progressContainer.style.display = 'none';
        
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        // Se for uma falha, mostrar mensagem
        if (data.status === 'FAILED') {
            showNotification('Coleta falhou: ' + (data.progresso || 'Erro desconhecido'), 'error');
        }
        
        // Resetar tempo de início
        collectionStartTime = null;
    }

    // Função para debug
    function debugCollection() {
        console.log('=== DEBUG COLETA ===');
        console.log('Selected Markets:', getSelectedMarkets());
        console.log('Selected Days:', getSelectedDays());
        console.log('Start Button:', startButton ? startButton.disabled : 'N/A');
        console.log('Polling Interval:', pollingInterval);
        console.log('Collection Start Time:', collectionStartTime);
    }

    // ========== CONFIGURAÇÃO DE EVENT LISTENERS ==========

    function setupEventListeners() {
        // Toggle do tema
        themeToggle.addEventListener('click', toggleTheme);

        // Menu mobile
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', toggleMobileMenu);
        }

        // Overlay do sidebar
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeMobileMenu);
        }

        // Dropdown do usuário
        if (userMenuBtn && userDropdown) {
            userMenuBtn.addEventListener('click', toggleUserDropdown);
        }

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', closeUserDropdown);

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }

        // Botão de iniciar coleta
        if (startButton) {
            startButton.addEventListener('click', startCollection);
        }

        // Debug (Ctrl + D)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                debugCollection();
            }
        });
    }

    // ========== INICIALIZAÇÃO ==========

    // Configuração inicial
    async function initializeConfiguration() {
        // Verificar autenticação antes de carregar qualquer coisa
        const isAuthenticated = await window.checkAuth();
        if (!isAuthenticated) {
            showNotification('Usuário não autenticado. Redirecionando...', 'error');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
            return;
        }

        // Verificar permissões
        const hasColetaPermission = await window.hasPermission('coleta');
        if (!hasColetaPermission) {
            showNotification('Você não tem permissão para acessar esta página.', 'error');
            setTimeout(() => {
                window.location.href = '/search.html';
            }, 2000);
            return;
        }

        await loadMarkets();
        setupDaysSelection();
    }

    // Inicialização principal
    initializeConfiguration();
    setupEventListeners();
    checkStatus();

    // Para debug
    console.log('Admin.js carregado com funções atualizadas');
    console.log('Markets container:', marketsContainer);

    // Verificar se há dados no Supabase (debug)
    async function debugMarkets() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            console.log('Usuário logado:', user);
            
            const { data: markets, error } = await supabase
                .from('supermercados')
                .select('nome, cnpj')
                .order('nome');
                
            console.log('Mercados do Supabase:', markets);
            console.log('Erro:', error);
        } catch (error) {
            console.error('Debug error:', error);
        }
    }

    // Executar debug após 2 segundos
    setTimeout(debugMarkets, 2000);
});
