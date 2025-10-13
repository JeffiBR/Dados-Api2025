document.addEventListener('DOMContentLoaded', () => {
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
    
    // Novos elementos de detalhes
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

    // Inicialização
    initializeConfiguration();
    setupEventListeners();
    checkStatus();

    // Configuração inicial
    async function initializeConfiguration() {
        await loadMarkets();
        setupDaysSelection();
    }

    // Carregar lista de mercados
    async function loadMarkets() {
        try {
            const response = await authenticatedFetch('/api/markets');
            if (!response.ok) throw new Error("Falha ao carregar mercados");
            
            const markets = await response.json();
            renderMarkets(markets);
            updateSelectedMarketsCount();
        } catch (error) {
            console.error('Erro ao carregar mercados:', error);
            showNotification('Erro ao carregar lista de mercados', 'error');
        }
    }

    // Renderizar lista de mercados
    function renderMarkets(markets) {
        marketsContainer.innerHTML = '';
        
        markets.forEach(market => {
            const marketElement = document.createElement('div');
            marketElement.className = 'market-checkbox';
            marketElement.innerHTML = `
                <input type="checkbox" id="market-${market.cnpj}" value="${market.cnpj}" checked>
                <label for="market-${market.cnpj}">${market.nome}</label>
            `;
            marketsContainer.appendChild(marketElement);
        });

        // Adicionar event listeners para os checkboxes
        marketsContainer.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', updateSelectedMarketsCount);
        });
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

    // Configurar event listeners
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
    }

    // Funções de UI
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
        logout();
    }

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

    // Atualizar interface com dados de status
    const updateUI = (data) => {
        if (data.status === 'RUNNING') {
            showProgressView(data);
        } else {
            showIdleView(data);
        }
    };

    // Mostrar view de progresso
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
        if (currentMarketElement) {
            currentMarketElement.textContent = data.currentMarket || 'Nenhum';
        }
        if (currentProductElement) {
            currentProductElement.textContent = data.currentProduct || 'Nenhum';
        }
        if (marketsProcessedElement) {
            marketsProcessedElement.textContent = data.marketsProcessed || 0;
        }
        if (totalMarketsElement) {
            totalMarketsElement.textContent = data.totalMarkets || 0;
        }
        if (productsInMarketElement) {
            productsInMarketElement.textContent = data.productsProcessedInMarket || 0;
        }
        if (totalProductsElement) {
            totalProductsElement.textContent = data.totalProducts || 0;
        }
        if (itemsInMarketElement) {
            itemsInMarketElement.textContent = data.itemsInCurrentMarket || 0;
        }
        if (totalItemsElement) {
            totalItemsElement.textContent = data.totalItemsFound || 0;
        }
        if (elapsedTimeElement) {
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

    // Mostrar view de idle/completo
    function showIdleView(data) {
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Coleta Manual';
        progressContainer.style.display = 'none';
        
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }

        // Mostrar relatório se a coleta foi completada
        if ((data.status === 'COMPLETED' || data.status === 'FAILED') && data.report) {
            showReport(data.report);
        } else {
            reportContainer.style.display = 'none';
        }
    }

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

    // Verificar status da coleta
    const checkStatus = async () => {
        try {
            const response = await authenticatedFetch('/api/collection-status');
            if (!response.ok) throw new Error("Falha ao verificar status.");
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
            if (pollingInterval) clearInterval(pollingInterval);
            showNotification(`Erro ao verificar status: ${error.message}`, 'error');
        }
    };

    // Iniciar coleta
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
            const response = await authenticatedFetch('/api/trigger-collection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    markets: selectedMarkets,
                    days: selectedDays
                })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || 'Erro desconhecido');
            
            showNotification(data.message || 'Coleta iniciada com sucesso!', 'success');
            checkStatus();
        } catch (error) {
            showNotification(`Falha ao iniciar a coleta: ${error.message}`, 'error');
            checkStatus();
        }
    };

    // Função para mostrar notificações
    const showNotification = (message, type = 'info') => {
        // Implementação existente de notificações
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : 
                    type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
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
});
