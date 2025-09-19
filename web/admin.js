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

    let pollingInterval;
    let sessionCheckInterval;

    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        const minutes = Math.floor(secs / 60);
        const seconds = secs % 60;
        return `${minutes > 0 ? `${minutes}m ` : ''}${seconds}s`;
    };

    // Função para verificar e manter a sessão ativa
    const checkAndMaintainSession = async () => {
        try {
            const session = await getSession();
            if (!session) {
                // Tenta renovar a sessão
                try {
                    await refreshSession();
                } catch (error) {
                    console.error('Falha ao renovar sessão:', error);
                    window.location.href = '/login.html';
                }
            }
        } catch (error) {
            console.error('Erro ao verificar sessão:', error);
        }
    };

    const updateUI = (data) => {
        if (data.status === 'RUNNING') {
            startButton.disabled = true;
            startButton.textContent = 'Coleta em Andamento...';
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
            
            // Inicia a verificação de sessão durante operações longas
            if (!sessionCheckInterval) {
                sessionCheckInterval = setInterval(checkAndMaintainSession, 60000); // Verifica a cada minuto
            }
        } else {
            startButton.disabled = false;
            startButton.textContent = 'Iniciar Coleta Manual';
            progressContainer.style.display = 'none';
            
            if (pollingInterval) {
                clearInterval(pollingInterval);
                pollingInterval = null;
            }
            
            // Para a verificação de sessão quando a operação termina
            if (sessionCheckInterval) {
                clearInterval(sessionCheckInterval);
                sessionCheckInterval = null;
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
            if (!response.ok) throw new Error("Falha ao verificar status.");
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
            if (pollingInterval) clearInterval(pollingInterval);
            if (sessionCheckInterval) clearInterval(sessionCheckInterval);
        }
    };

    const startCollection = async () => {
        if (!confirm('Tem certeza que deseja iniciar a coleta de dados?')) return;
        
        // Verifica a sessão antes de iniciar
        try {
            await checkAndMaintainSession();
        } catch (error) {
            alert('Sessão expirada. Por favor, faça login novamente.');
            window.location.href = '/login.html';
            return;
        }
        
        reportContainer.style.display = 'none'; // Esconde relatório antigo
        try {
            const response = await authenticatedFetch(`/api/trigger-collection`, { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail);
            alert(data.message);
            checkStatus();
        } catch (error) {
            alert(`Falha ao iniciar a coleta: ${error.message}`);
            checkStatus();
        }
    };

    startButton.addEventListener('click', startCollection);
    checkStatus();
});
