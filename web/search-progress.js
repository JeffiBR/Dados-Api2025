// search-progress.js - Gerenciamento da barra de progresso da busca

class SearchProgress {
    constructor() {
        this.progressContainer = null;
        this.progressInterval = null;
        this.startTime = null;
        this.currentMarketIndex = 0;
        this.totalMarkets = 0;
        this.foundProducts = 0;
        this.isActive = false;

        this.initializeProgressBar();
    }

    initializeProgressBar() {
        this.progressContainer = document.createElement('div');
        this.progressContainer.className = 'search-progress';
        this.progressContainer.innerHTML = `
            <div class="progress-header">
                <div class="progress-title">
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <span>Buscando produtos...</span>
                </div>
                <div class="progress-stats">
                    <div class="progress-market">
                        <i class="fas fa-store"></i>
                        <span id="currentMarket">Iniciando...</span>
                    </div>
                </div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" id="progressBar"></div>
            </div>
            <div class="progress-details">
                <div class="progress-percentage" id="progressPercentage">0%</div>
                <div class="progress-time">
                    <i class="fas fa-clock"></i>
                    <span id="timeRemaining">Calculando...</span>
                </div>
                <div class="progress-products">
                    <i class="fas fa-box"></i>
                    <span id="productsFound">0 produtos encontrados</span>
                </div>
            </div>
            <div class="progress-estimate">
                <i class="fas fa-info-circle"></i>
                <span id="progressEstimate">Estimativa de tempo: calculando...</span>
            </div>
        `;
    }

    initializeProgress(marketsCount) {
        this.totalMarkets = marketsCount;
        this.currentMarketIndex = 0;
        this.foundProducts = 0;
        this.startTime = Date.now();
        this.isActive = true;

        // Insere a barra de progresso após os controles de busca
        const searchControls = document.querySelector('.search-controls');
        if (searchControls && this.progressContainer) {
            // Remove barra de progresso existente se houver
            const existingProgress = searchControls.parentNode.querySelector('.search-progress');
            if (existingProgress) {
                existingProgress.remove();
            }
            searchControls.parentNode.insertBefore(this.progressContainer, searchControls.nextSibling);
        }

        this.progressContainer.style.display = 'block';
        this.progressContainer.className = 'search-progress searching';

        this.updateProgress();
        this.progressInterval = setInterval(() => this.updateProgress(), 1000);
    }

    updateProgress() {
        if (!this.isActive || this.currentMarketIndex >= this.totalMarkets) return;

        const elapsed = (Date.now() - this.startTime) / 1000;
        const progress = Math.min(100, (this.currentMarketIndex / this.totalMarkets) * 100);

        // Atualiza a barra visual
        const progressBar = document.getElementById('progressBar');
        const progressPercentage = document.getElementById('progressPercentage');
        const timeRemaining = document.getElementById('timeRemaining');
        const productsFound = document.getElementById('productsFound');
        const progressEstimate = document.getElementById('progressEstimate');

        if (progressBar) progressBar.style.width = `${progress}%`;
        if (progressPercentage) progressPercentage.textContent = `${Math.round(progress)}%`;

        // Calcula tempo restante
        const marketsRemaining = this.totalMarkets - this.currentMarketIndex;
        const avgTimePerMarket = elapsed / (this.currentMarketIndex || 1);
        const estimatedTimeRemaining = marketsRemaining * avgTimePerMarket;

        if (timeRemaining) timeRemaining.textContent = this.formatTime(estimatedTimeRemaining);
        if (productsFound) productsFound.textContent = `${this.foundProducts} produto${this.foundProducts !== 1 ? 's' : ''} encontrado${this.foundProducts !== 1 ? 's' : ''}`;
        if (progressEstimate) progressEstimate.textContent = 
            `Estimativa: ${this.formatTime(estimatedTimeRemaining)} restantes (${Math.round(avgTimePerMarket)}s/mercado)`;
    }

    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.ceil(seconds)} segundos`;
        } else {
            const minutes = Math.ceil(seconds / 60);
            return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
        }
    }

    updateMarketProgress(marketName, productsInMarket = 0) {
        if (!this.isActive) return;

        this.currentMarketIndex++;
        this.foundProducts += productsInMarket;

        const currentMarketElement = document.getElementById('currentMarket');
        if (currentMarketElement) {
            currentMarketElement.innerHTML = 
                `<i class="fas fa-store"></i> ${marketName} (${this.currentMarketIndex}/${this.totalMarkets})`;
        }

        this.updateProgress();
    }

    completeProgress(success = true) {
        this.isActive = false;

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        const progressBar = document.getElementById('progressBar');
        const progressPercentage = document.getElementById('progressPercentage');
        const timeRemaining = document.getElementById('timeRemaining');
        const currentMarketElement = document.getElementById('currentMarket');

        if (progressBar) progressBar.style.width = '100%';
        if (progressPercentage) progressPercentage.textContent = '100%';
        if (timeRemaining) timeRemaining.textContent = 'Concluído';

        if (success) {
            this.progressContainer.className = 'search-progress completed';
            if (currentMarketElement) {
                currentMarketElement.innerHTML = 
                    '<i class="fas fa-check-circle"></i> Busca concluída';
            }
        } else {
            this.progressContainer.className = 'search-progress error';
            if (currentMarketElement) {
                currentMarketElement.innerHTML = 
                    '<i class="fas fa-exclamation-circle"></i> Busca interrompida';
            }
        }

        // Remove a barra após 5 segundos
        setTimeout(() => {
            if (this.progressContainer && this.progressContainer.parentNode) {
                this.progressContainer.style.display = 'none';
            }
        }, 5000);
    }

    hideProgress() {
        this.isActive = false;

        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        if (this.progressContainer) {
            this.progressContainer.style.display = 'none';
        }
    }

    // Método para simulação de busca (remover na implementação real)
    async simulateMarketSearch(markets, searchFunction) {
        const marketNames = {};
        markets.forEach(market => {
            marketNames[market.cnpj] = market.nome;
        });

        for (const [index, cnpj] of markets.entries()) {
            const marketName = marketNames[cnpj] || `Mercado ${index + 1}`;

            // Simula tempo de busca por mercado
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));

            // Simula produtos encontrados
            const simulatedProducts = Math.floor(Math.random() * 8);
            this.updateMarketProgress(marketName, simulatedProducts);
        }
    }
}

// Cria uma instância global para ser usada em outros arquivos
window.searchProgress = new SearchProgress();