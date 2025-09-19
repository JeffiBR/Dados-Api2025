document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    // Elementos de Progresso
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progressBar');
    const progressPercentText = document.getElementById('progressPercentText');
    const etaText = document.getElementById('etaText');
    const progressText = document.getElementById('progressText');
    const itemsFoundText = document.getElementById('itemsFoundText');
    // Elementos do Relatório
    const reportContainer = document.getElementById('report-container');
    const reportTotalItems = document.getElementById('report-total-items');
    const reportDuration = document.getElementById('report-duration');
    const reportTableBody = document.querySelector('#reportTable tbody');

    // Elementos do tema
    const mobileMenuButton = document.querySelector('.mobile-menu-button');
    const sidebar = document.querySelector('.sidebar');
    const themeToggle = document.getElementById('themeToggle');
    const profileButton = document.querySelector('.profile-button');
    const profileDropdown = document.querySelector('.profile-dropdown');
    const sidebarOverlay = document.querySelector('.sidebar-overlay');

    let pollingInterval;

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

    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        const minutes = Math.floor(secs / 60);
        const seconds = secs % 60;
        return `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
    };

    const updateUI = (data) => {
        if (data.status === 'RUNNING') {
            startButton.disabled = true;
            startButton.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Coleta em Andamento...';
            progressContainer.style.display = 'block';
            reportContainer.style.display = 'none';

            const percent = Math.round(data.progressPercent || 0);
            progressBar.style.width = `${percent}%`;
            progressPercentText.textContent = `${percent}%`;
            etaText.textContent = `Tempo Restante: ${formatSeconds(data.etaSeconds)}`;
            progressText.textContent = data.progresso || '...';
            itemsFoundText.textContent = data.totalItemsFound || 0;
            
            if (!pollingInterval) {
                pollingInterval = setInterval(checkStatus, 3000);
            }
        } else {
            startButton.disabled = false;
            startButton.innerHTML = '<i class="fas fa-play"></i> Iniciar Coleta Manual';
            progressContainer.style.display = 'none';
            
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }

            if ((data.status === 'COMPLETED' || data.status === 'FAILED') && data.report) {
                reportContainer.style.display = 'block';
                reportTotalItems.textContent = data.report.totalItemsSaved;
                reportDuration.textContent = formatSeconds(data.report.totalDurationSeconds);
                reportTableBody.innerHTML = '';
                data.report.marketBreakdown.forEach(market => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${market.marketName}</td><td>${market.itemsFound}</td><td>${market.duration}</td>`;
                    reportTableBody.appendChild(row);
                });
            } else {
                 reportContainer.style.display = 'none';
            }
        }
    };

    const checkStatus = async () => {
        try {
            const response = await authenticatedFetch(`/api/collection-status`);
            
            // Verificar se a resposta é 401 (Unauthorized)
            if (response.status === 401) {
                throw new Error("Sessão expirada. Faça login novamente.");
            }
            
            if (!response.ok) throw new Error("Falha ao verificar status.");
            
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
            if (pollingInterval) clearInterval(pollingInterval);
            
            // Verificar se é um erro de autenticação
            if (error.message.includes("Sessão não encontrada") || 
                error.message.includes("Sessão expirada") ||
                error.message.includes("401")) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                window.location.href = '/login.html';
                return;
            }
            
            // Mostrar notificação de erro para outros tipos de erro
            const notification = document.createElement('div');
            notification.className = 'notification error';
            notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro ao verificar status: ${error.message}`;
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
        }
    };

    const startCollection = async () => {
        if (!confirm('Tem certeza que deseja iniciar a coleta de dados?')) return;
        reportContainer.style.display = 'none'; // Esconde relatório antigo
        try {
            const response = await authenticatedFetch(`/api/trigger-collection`, { method: 'POST' });
            
            // Verificar se a resposta é 401 (Unauthorized)
            if (response.status === 401) {
                throw new Error("Sessão expirada. Faça login novamente.");
            }
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail);
            
            // Mostrar notificação de sucesso
            const notification = document.createElement('div');
            notification.className = 'notification success';
            notification.innerHTML = `<i class="fas fa-check-circle"></i> ${data.message}`;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.classList.add('show');
            }, 10);
            
            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    document.body.removeChild(notification);
                }, 300);
            }, 3000);
            
            checkStatus();
        } catch (error) {
            // Verificar se é um erro de autenticação
            if (error.message.includes("Sessão não encontrada") || 
                error.message.includes("Sessão expirada") ||
                error.message.includes("401")) {
                alert("Sua sessão expirou. Por favor, faça login novamente.");
                window.location.href = '/login.html';
                return;
            }
            
            // Mostrar notificação de erro para outros tipos de erro
            const notification = document.createElement('div');
            notification.className = 'notification error';
            notification.innerHTML = `<i class="fas fa-exclamation-circle"></i> Falha ao iniciar a coleta: ${error.message}`;
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
            
            checkStatus();
        }
    };

    startButton.addEventListener('click', startCollection);
    checkStatus();
});
