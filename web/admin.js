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

    const formatSeconds = (secs) => {
        if (secs < 0 || secs === null || secs === undefined) return 'Calculando...';
        if (secs === 0) return '0s';
        const minutes = Math.floor(secs / 60);
        const seconds = secs % 60;
        return `${minutes}m ${seconds}s`;
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
        } else {
            startButton.disabled = false;
            startButton.textContent = 'Iniciar Coleta Manual';
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
            if (!response.ok) throw new Error("Falha ao verificar status.");
            const data = await response.json();
            updateUI(data);
        } catch (error) {
            console.error('Erro ao verificar status:', error.message);
            if (pollingInterval) clearInterval(pollingInterval);
        }
    };

    const startCollection = async () => {
        if (!confirm('Tem certeza que deseja iniciar a coleta de dados?')) return;
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
